const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

const {
  CLIENT_PLATFORM,
  RIOT_AGENT,
  SKINS_ITEM_TYPE_ID,
} = require('../config/constants');
const { firstDefined } = require('../utils/values');

function readLockfile() {
  const lockfilePath = path.join(
    os.homedir(),
    'AppData',
    'Local',
    'Riot Games',
    'Riot Client',
    'Config',
    'lockfile'
  );

  if (!fs.existsSync(lockfilePath)) {
    throw new Error(
      'Riot lockfile not found. Start Riot Client or VALORANT first, then try again. Expected path:\n' +
        lockfilePath
    );
  }

  const raw = fs.readFileSync(lockfilePath, 'utf8').trim();
  const [name, pid, port, password, protocol] = raw.split(':');

  if (!port || !password) {
    throw new Error('Lockfile exists but could not be parsed.');
  }

  return { name, pid, port, password, protocol };
}

function httpsJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { ...options, agent: RIOT_AGENT }, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        const statusCode = res.statusCode || 500;
        const ok = statusCode >= 200 && statusCode < 300;
        let parsed = body;

        try {
          parsed = body ? JSON.parse(body) : null;
        } catch {
          // Fall back to the raw response text.
        }

        if (!ok) {
          const reason = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
          reject(new Error(`Request failed (${statusCode}) for ${url}\n${reason}`));
          return;
        }

        resolve(parsed);
      });
    });

    req.on('error', reject);
    req.end();
  });
}

function getBasicAuth(password) {
  return 'Basic ' + Buffer.from(`riot:${password}`).toString('base64');
}

function parseLaunchArgs(argumentsList = []) {
  const joined = argumentsList.join(' ');
  const extract = (patterns) => {
    for (const pattern of patterns) {
      const match = joined.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  };

  return {
    region: extract([/--ares-deployment=([\w-]+)/i, /-ares-deployment=([\w-]+)/i]),
    shard: extract([
      /--ares-endpoint=https:\/\/pd\.([a-z]+)\.a\.pvp\.net/i,
      /https:\/\/glz-[\w-]+-1\.([a-z]+)\.a\.pvp\.net/i,
    ]),
    puuid: extract([/--subject=([0-9a-f-]{36})/i, /--puuid=([0-9a-f-]{36})/i]),
    version: extract([/--version=([\w.\-]+)/i]),
  };
}

async function getSessionData(lockfile) {
  const auth = getBasicAuth(lockfile.password);

  const [sessions, entitlements, userInfo] = await Promise.all([
    httpsJson(`https://127.0.0.1:${lockfile.port}/product-session/v1/external-sessions`, {
      headers: { Authorization: auth },
    }),
    httpsJson(`https://127.0.0.1:${lockfile.port}/entitlements/v1/token`, {
      headers: { Authorization: auth },
    }),
    httpsJson(`https://127.0.0.1:${lockfile.port}/rso-auth/v1/authorization/userinfo`, {
      headers: { Authorization: auth },
    }),
  ]);

  const valorantSession = Object.values(sessions).find(
    (session) => session.productId === 'valorant'
  );

  if (!valorantSession) {
    throw new Error('VALORANT session not found. Open VALORANT fully and sign in, then refresh.');
  }

  const launchData = parseLaunchArgs(valorantSession.launchConfiguration?.arguments || []);
  const userInfoParsed =
    typeof userInfo.userInfo === 'string' ? JSON.parse(userInfo.userInfo) : userInfo.userInfo;

  const region = firstDefined(
    launchData.region,
    userInfoParsed?.acct?.region,
    userInfoParsed?.region,
    'eu'
  );

  const shard = firstDefined(
    launchData.shard,
    region === 'latam' || region === 'br' || region === 'na' ? 'na' : region,
    'eu'
  );

  const clientVersion = firstDefined(valorantSession.version, launchData.version);
  const puuid = firstDefined(entitlements.subject, launchData.puuid, userInfoParsed?.sub);

  if (!clientVersion) {
    throw new Error('Could not determine VALORANT client version from the local session.');
  }

  if (!puuid) {
    throw new Error('Could not determine player UUID from the local session.');
  }

  return {
    authToken: entitlements.accessToken,
    clientVersion,
    entitlementToken: entitlements.token,
    gameName: userInfoParsed?.acct?.game_name || 'Unknown',
    puuid,
    region,
    shard,
    tagLine: userInfoParsed?.acct?.tag_line || 'Unknown',
  };
}

async function getOwnedSkinIds(session) {
  const url = `https://pd.${session.shard}.a.pvp.net/store/v1/entitlements/${session.puuid}/${SKINS_ITEM_TYPE_ID}`;
  const data = await httpsJson(url, {
    headers: {
      Authorization: `Bearer ${session.authToken}`,
      'X-Riot-ClientPlatform': CLIENT_PLATFORM,
      'X-Riot-ClientVersion': session.clientVersion,
      'X-Riot-Entitlements-JWT': session.entitlementToken,
    },
  });

  return Array.isArray(data?.Entitlements)
    ? data.Entitlements.map((item) => item.ItemID).filter(Boolean)
    : [];
}

module.exports = {
  getOwnedSkinIds,
  getSessionData,
  readLockfile,
};

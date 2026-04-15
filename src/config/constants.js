const https = require('https');
const path = require('path');

const PORT = Number(process.env.PORT) || 3010;
const PUBLIC_DIR = path.resolve(__dirname, '..', '..', 'public');

const SKINS_ITEM_TYPE_ID = 'e7c63390-eda7-46e0-bb7a-a6abdacd2433';
const CLIENT_PLATFORM =
  'ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9';

const WEAPON_ORDER = [
  'Classic',
  'Shorty',
  'Frenzy',
  'Ghost',
  'Sheriff',
  'Stinger',
  'Spectre',
  'Bucky',
  'Judge',
  'Bulldog',
  'Guardian',
  'Phantom',
  'Vandal',
  'Marshal',
  'Outlaw',
  'Operator',
  'Ares',
  'Odin',
  'Melee',
  'Knife',
];

const RIOT_AGENT = new https.Agent({ rejectUnauthorized: false });

module.exports = {
  CLIENT_PLATFORM,
  PORT,
  PUBLIC_DIR,
  RIOT_AGENT,
  SKINS_ITEM_TYPE_ID,
  WEAPON_ORDER,
};

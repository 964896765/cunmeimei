"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("../backend/node_modules/sharp");

// The original home icons use colorful silhouettes, pale details and a soft highlight.
const icons = {
  C07: ["#FFD577", "#E27234", `
    <path d="M14 22h36l4 28a6 6 0 0 1-6 7H16a6 6 0 0 1-6-7z"/>
    <path d="M23 26V17a9 9 0 0 1 18 0v9" fill="none" stroke="#F59A43" stroke-width="5"/>
    <path d="M21 35a12 12 0 0 0 22 0" fill="none" stroke="#FFF0C4" stroke-width="2.8" stroke-linecap="round"/>`],
  C08: ["#A9C8FF", "#5467D7", `
    <rect x="13" y="10" width="37" height="44" rx="8"/>
    <path d="M48 33h7v14a7 7 0 0 1-7 7h-7" fill="#6C79DD"/>
    <rect x="21" y="20" width="10" height="10" rx="2" fill="#FFF1FF"/>
    <path d="M37 22h6m-6 6h6M21 37h22m-22 7h18" stroke="#ECEDFF" stroke-width="2.8" stroke-linecap="round"/>`],
  C09: ["#83DDD8", "#2D82AB", `
    <path d="M23 50l-7 8m25-8 7 8" stroke="#4777A4" stroke-width="4" stroke-linecap="round"/>
    <rect x="15" y="8" width="34" height="45" rx="12"/>
    <rect x="19" y="18" width="26" height="17" rx="5" fill="#DCF5FF"/>
    <path d="M25 13h14m-7 5v17" stroke="#55A6B9" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="23" cy="43" r="3" fill="#FFF5CA"/><circle cx="41" cy="43" r="3" fill="#FFF5CA"/>`],
  C10: ["#FFA38B", "#DB536E", `
    <rect x="13" y="40" width="9" height="15" rx="3.5" fill="#8B4B71"/><rect x="42" y="40" width="9" height="15" rx="3.5" fill="#8B4B71"/>
    <path d="m15 30 5-13a6 6 0 0 1 5-4h14a6 6 0 0 1 5 4l5 13 5 6v11a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3V36z"/>
    <path d="M20 30l4-10h16l4 10z" fill="#FFEDF2"/>
    <path d="M18 39h6m16 0h6" stroke="#FFF5B9" stroke-width="4.5" stroke-linecap="round"/>`],
  C11: ["#FF9BC8", "#C84280", `
    <path d="M25 32V14c0-3 11-8 14-5v23z" fill="#EC518D"/>
    <path d="M29 17v11" stroke="#FFB4D8" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="22" y="29" width="20" height="9" rx="2" fill="#FFC662"/>
    <rect x="20" y="37" width="24" height="19" rx="5"/>
    <path d="M48 18v11m-5-5h10" stroke="#F5A6CC" stroke-width="2.6" stroke-linecap="round"/>`],
  C13: ["#B8A9FF", "#6A62D8", `
    <path d="M11 17c9-4 16-2 21 2 5-4 12-6 21-2v32c-9-2-16-1-21 4-5-5-12-6-21-4z"/>
    <path d="M15 15c8-2 13-1 17 4 4-5 9-6 17-4v29c-8-2-13 0-17 4-4-4-9-6-17-4z" fill="#F3EDFF"/>
    <path d="M32 20v25m-12-20 7 1m-7 5 7 1m10-6 7-1m-7 7 7-1" stroke="#A395EF" stroke-width="2" stroke-linecap="round"/>`],
  C15: ["#9AE3CE", "#48A892", `
    <path d="M23 21v-5a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v5" fill="none" stroke="#62BCA7" stroke-width="4"/>
    <rect x="10" y="20" width="44" height="33" rx="9"/>
    <path d="M13 31h38" stroke="#CAF6E3" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M32 32v13m-6.5-6.5h13" stroke="#FFF4EF" stroke-width="4.5" stroke-linecap="round"/>`],
  C16: ["#9CC5FC", "#5176D5", `
    <circle cx="32" cy="32" r="22"/>
    <circle cx="32" cy="32" r="17.5" fill="none" stroke="#BACFFF" stroke-width="1.5"/>
    <path d="M43 20 36 37 20 45l7-18z" fill="#FFF0CA"/>
    <path d="m20 45 7-18 9 10z" fill="#FFC778"/>
    <circle cx="32" cy="32" r="2.8" fill="#FFF8E7"/>`],
  C17: ["#D5B1FF", "#A76ECF", `
    <rect x="11" y="21" width="7" height="32" rx="3" fill="#9F69C6"/>
    <rect x="46" y="31" width="7" height="22" rx="3" fill="#9F69C6"/>
    <path d="M17 30h32v17H17a5 5 0 0 1-5-5v-7a5 5 0 0 1 5-5z"/>
    <path d="M18 24h10a3 3 0 0 1 3 3v6H17v-6a3 3 0 0 1 1-3z" fill="#FFF0FF"/>
    <path d="M32 31h15" stroke="#EEE0FE" stroke-width="3" stroke-linecap="round"/>`],
  C18: ["#FFB499", "#F17860", `
    <g transform="rotate(-28 32 32)">
      <rect x="19" y="28" width="25" height="8" rx="4" fill="#EB865C"/>
      <rect x="10" y="20" width="10" height="24" rx="5"/>
      <rect x="17" y="16" width="10" height="32" rx="5"/>
      <rect x="37" y="16" width="10" height="32" rx="5"/>
      <rect x="44" y="20" width="10" height="24" rx="5"/>
      <path d="M22 22v9m20-9v9" stroke="#FFE4D1" stroke-width="2.6" stroke-linecap="round"/>
    </g>`],
  C20: ["#A8A4FB", "#6959BC", `
    <rect x="15" y="11" width="23" height="44" rx="5"/>
    <rect x="35" y="24" width="15" height="31" rx="4" fill="#9A87DC"/>
    <path d="M11 54h43" stroke="#8A74CC" stroke-width="4" stroke-linecap="round"/>
    <path d="M22 21h9m-9 7h9m-9 7h9m-9 7h9m10-10h4m-4 7h4m-4 7h4" stroke="#EFE7FF" stroke-width="2.6" stroke-linecap="round"/>`],
  C21: ["#FFD694", "#E08852", `
    <ellipse cx="16" cy="29" rx="5.5" ry="7.5" transform="rotate(-24 16 29)"/>
    <ellipse cx="26" cy="20" rx="5.5" ry="8" transform="rotate(-12 26 20)"/>
    <ellipse cx="39" cy="20" rx="5.5" ry="8" transform="rotate(12 39 20)"/>
    <ellipse cx="49" cy="29" rx="5.5" ry="7.5" transform="rotate(24 49 29)"/>
    <path d="M32 29c7 0 15 10 15 17 0 7-7 8-11 5a6 6 0 0 0-8 0c-4 3-11 2-11-5 0-7 8-17 15-17z"/>`],
  C22: ["#88D9ED", "#4D94C5", `
    <circle cx="32" cy="12" r="6"/>
    <path d="M30 23v15h14l5 12 7-2m-25-20h13" fill="none" stroke="#62ACD7" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M23 26a14 14 0 1 0 16 19" fill="none" stroke="url(#paint)" stroke-width="6" stroke-linecap="round"/>`],
  C23: ["#DAD8DC", "#77737D", `
    <path d="M33 8c7 7 7 13 0 15-8-2-7-8 0-15z" fill="#AAA8B0"/>
    <rect x="22" y="24" width="21" height="28" rx="5"/>
    <path d="M26 30h13m-19 23h25" stroke="#BDBBC3" stroke-width="3" stroke-linecap="round"/>`],
  C24: ["#A0BCFF", "#596ECD", `
    <rect x="8" y="16" width="30" height="30" rx="6"/>
    <path d="M37 27h9a4 4 0 0 1 3 1l8 10v8H37z" fill="#7F93E8"/>
    <path d="M42 31h4l6 7H42z" fill="#E9F0FF"/>
    <circle cx="19" cy="47" r="6" fill="#5D5496"/><circle cx="48" cy="47" r="6" fill="#5D5496"/>
    <circle cx="19" cy="47" r="2.3" fill="#D7DEFF"/><circle cx="48" cy="47" r="2.3" fill="#D7DEFF"/>
    <path d="M15 24h16" stroke="#E5E9FE" stroke-width="2.7" stroke-linecap="round"/>`],
  C25: ["#B5E584", "#5CBA7A", `
    <path d="M32 39V22" stroke="#65B780" stroke-width="4.2" stroke-linecap="round"/>
    <path d="M33 31C32 18 37 12 51 11c0 14-7 19-18 20zM31 33c-12 0-17-6-19-16 13 0 17 5 19 16z"/>
    <path d="M18 39h28l-4 13a5 5 0 0 1-5 4H27a5 5 0 0 1-5-4z" fill="#DA926F"/>
    <rect x="16" y="37" width="32" height="6" rx="3" fill="#EDAC83"/>`],
  C26: ["#A6D1F5", "#6492C7", `
    <path d="M11 25 30 12a4 4 0 0 1 4 0l19 13v4H11z"/>
    <path d="M17 30v17m10-17v17m10-17v17m10-17v17" stroke="#82AFD7" stroke-width="5" stroke-linecap="round"/>
    <rect x="13" y="46" width="38" height="5" rx="2" fill="#A1C8ED"/>
    <rect x="9" y="51" width="46" height="5" rx="2.5" fill="#729BCA"/>
    <circle cx="32" cy="22" r="3.5" fill="#EFF8FF"/>`],
  C27: ["#FFDC82", "#E39448", `
    <path d="m32 9 19 7v14c0 12-6 20-19 25-13-5-19-13-19-25V16z"/>
    <path d="m32 14 14 5v11c0 9-5 15-14 20-9-5-14-11-14-20V19z" fill="none" stroke="#FFE6AA" stroke-width="1.7"/>
    <path d="m26 23 6 8 6-8m-12 9h12m-12 5h12m-6-5v10" stroke="#FFF5D3" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>`],
};

async function build() {
  const output = path.resolve(__dirname, "../miniprogram/assets/home-icons");
  for (const [id, [light, shade, shape]] of Object.entries(icons)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 64 64">
      <defs><linearGradient id="paint" x1=".2" y1="0" x2=".8" y2="1"><stop stop-color="${light}"/>
      <stop offset="1" stop-color="${shade}"/></linearGradient></defs>
      <g fill="url(#paint)">${shape}</g>
    </svg>`;
    await sharp(Buffer.from(svg)).png({ palette: true, colours: 44, dither: 0, effort: 10 })
      .toFile(path.join(output, `${id}.png`));
  }
  console.log(`Built ${Object.keys(icons).length} home category icons.`);
}

build().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

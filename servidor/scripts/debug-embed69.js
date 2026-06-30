const axios = require('axios');
const crypto = require('crypto');
const PelisplusHD = require('../src/providers/PelisplusHD');

function extractDataLinkJson(html) {
  const idx = html.indexOf('dataLink = ');
  if (idx === -1) return null;
  const start = html.indexOf('[', idx);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < html.length; i++) {
    if (html[i] === '[') depth++;
    else if (html[i] === ']') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

(async () => {
  const p = new PelisplusHD();
  const url = 'https://embed69.org/f/tt37969901/';
  const { data } = await axios.get(url);
  const shortMatch = data.match(/dataLink = (\[.*?\]);/);
  const fullJson = extractDataLinkJson(data);
  console.log('short match len', shortMatch?.[1]?.length);
  console.log('full json len', fullJson?.length);

  const challengeMatch = data.match(/const POW_CHALLENGE = '([^']+)'/);
  const diffMatch = data.match(/const POW_DIFFICULTY = (\d+)/);
  const saltMatch = data.match(/const POW_SALT = '([^']+)'/);
  const aesKey = p.derivarLlaveAes(challengeMatch[1], parseInt(diffMatch[1]), saltMatch[1]);

  const dataLink = JSON.parse(fullJson || shortMatch[1]);
  for (const lang of dataLink) {
    for (const embed of lang.sortedEmbeds || []) {
      const dec = p.desencriptarAES(embed.link, aesKey);
      console.log(lang.video_language, embed.servername, dec?.slice(0, 100));
    }
  }
})().catch(console.error);

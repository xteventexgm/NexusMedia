const axios = require('axios');
const cheerio = require('cheerio');
const PelisplusHD = require('../src/providers/PelisplusHD');

(async () => {
  const p = new PelisplusHD();
  const cat = await p.getCatalogo({}, 1);
  const det = await p.getDetalles(cat[0].url);
  const ep = det.episodios[0].url;
  console.log('EP', ep);
  const { data } = await axios.get(ep);
  console.log('var video =', data.includes('var video ='));
  console.log('embed69 =', data.includes('embed69'));

  const $ = cheerio.load(data);
  const scriptHtml =
    $('script')
      .filter((i, el) => $(el).html().includes('var video ='))
      .html() || '';
  let urls = scriptHtml.match(/https?:\/\/[^"'\s<>]+/g) || [];
  urls = [...new Set(urls)];
  console.log('urls in video script', urls);

  const links = await p.getEnlaces(ep);
  console.log('servidores', links.length, links);
})().catch((e) => console.error(e));

const puppeteer = require('puppeteer');
const { Parser } = require('json2csv');
const fs = require('fs');

const urls = [
  'https://www.flipkart.com',
  'https://www.flipkart.com/mobiles',
  'https://www.flipkart.com/laptops',
  'https://www.flipkart.com/televisions',
  'https://www.flipkart.com/cameras',
  'https://www.flipkart.com/clothing',
  'https://www.flipkart.com/footwear',
  'https://www.flipkart.com/furniture',
  'https://www.flipkart.com/appliances',
  'https://www.flipkart.com/sports'
];

async function scrapeMetaData(url, page) {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    return await page.evaluate(() => ({
      url: window.location.href,
      title: document.title || 'Missing',
      description: document.querySelector('meta[name="description"]')
        ?.getAttribute('content') || 'Missing',
      h1: document.querySelector('h1')?.innerText || 'Missing',
    }));
 } catch (error) {
    console.log(`Error on ${url}: ${error.message}`);
    return {

      url: url,
      title: 'Error',
      description: 'Error',
      h1: error.message
    };
  }
}

async function main() {
  console.log('Launching browser...');
  
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  const results = [];

  for (const url of urls) {
    console.log(`Scraping: ${url}`);
    const data = await scrapeMetaData(url, page);
    results.push(data);
    console.log(`Done: ${data.title}`);
  }

  await browser.close();

  const parser = new Parser();
  const csv = parser.parse(results);
  fs.writeFileSync('audit.csv', csv);
  
  console.log('Done. audit.csv saved successfully');
  console.log(`Total pages scraped: ${results.length}`);
}

main();
const puppeteer = require('puppeteer');
const { Parser } = require('json2csv');
const fs = require('fs');
const axios = require('axios');

async function getRawHtml(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });
    return response.data;
  } catch (error) {
    return '';
  }
}

async function scrapeMetaData(url, page) {
  try {
    const response = await page.goto(url, { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const statusCode = response ? response.status() : 'Unknown';

    const rawHtml = await getRawHtml(url);

    const rawH1 = rawHtml.match(/<h1[^>]*>(.*?)<\/h1>/is)?.[1]
      ?.replace(/<[^>]*>/g, '').trim() || 'Missing';
    
    const data = await page.evaluate(() => ({
      url: window.location.href,
      title: document.title || 'Missing',
      titleLength: document.title.length || 0,
      titleStatus: document.title.length > 60 ? 'Too Long' : document.title.length < 30 ? 'Too Short' : 'Good',
      description: document.querySelector('meta[name="description"]')
        ?.getAttribute('content') || 'Missing',
      descriptionLength: document.querySelector('meta[name="description"]')
        ?.getAttribute('content')?.length || 0,
      descriptionStatus: (() => {
        const desc = document.querySelector('meta[name="description"]')
          ?.getAttribute('content');
        if (!desc) return 'Missing';
        if (desc.length > 160) return 'Too Long';
        if (desc.length < 70) return 'Too Short';
        return 'Good';
      })(),
      renderedH1: document.querySelector('h1')?.innerText || 'Missing',
      h1Count: document.querySelectorAll('h1').length,
      canonical: document.querySelector('link[rel="canonical"]')
        ?.getAttribute('href') || 'Missing',
      robots: document.querySelector('meta[name="robots"]')
        ?.getAttribute('content') || 'Missing',
      schemaCount: document.querySelectorAll('script[type="application/ld+json"]').length,
      schema: (() => {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        if (!scripts.length) return 'Missing';
        const types = [];
        scripts.forEach(script => {
          try {
            const data = JSON.parse(script.innerText);
            if (Array.isArray(data)) {
              data.forEach(item => {
                if (item['@type']) types.push(item['@type']);
              });
            } else {
              if (data['@type']) types.push(data['@type']);
            }
          } catch {
            types.push('Parse Error');
          }
        });
        return types.length ? types.join(' | ') : 'Missing';
      })(),
      totalImages: document.querySelectorAll('img').length,
      missingAlt: document.querySelectorAll('img:not([alt]), img[alt=""]').length,
      wordCount: (() => {
        const scripts = document.querySelectorAll('script, style, noscript');
        scripts.forEach(el => el.remove());
        const text = document.body.innerText || '';
        const words = text.split(/\s+/).filter(word => word.length > 0);
        return words.length;
      })(),
      thinContent: (() => {
        const text = document.body.innerText || '';
        const words = text.split(/\s+/).filter(word => word.length > 0);
        return words.length < 300 ? 'YES' : 'NO';
      })(),
      internalLinks: document.querySelectorAll('a[href^="/"], a[href^="https://www.flipkart.com"]').length,
    }));

    const ssrProblem = rawH1 === 'Missing' && data.renderedH1 !== 'Missing' ? 'YES' : 'NO';
    
    return { ...data, rawH1, ssrProblem, statusCode };
    
  } catch (error) {
    console.log(`Error on ${url}: ${error.message}`);
    return {
      url: url,
      title: 'Error',
      titleLength: 0,
      titleStatus: 'Error',
      description: 'Error',
      descriptionLength: 0,
      descriptionStatus: 'Error',
      renderedH1: 'Error',
      h1Count: 0,
      canonical: 'Error',
      robots: 'Error',
      schemaCount: 0,
      schema: 'Error',
      totalImages: 0,
      missingAlt: 0,
      wordCount: 0,
      thinContent: 'Error',
      internalLinks: 0,
      rawH1: 'Error',
      ssrProblem: 'Error',
      statusCode: error.message
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
  
  const results = [];

  for (const url of urls) {
    console.log(`Scraping: ${url}`);
    const data = await scrapeMetaData(url, page);
    results.push(data);
    console.log(`Done: ${data.statusCode} | Words: ${data.wordCount} | Thin: ${data.thinContent} | Title: ${data.titleStatus}`);
  }

  await browser.close();

  const parser = new Parser();
  const csv = parser.parse(results);
  fs.writeFileSync('audit.csv', csv);
  
  console.log('——————————————————————————');
  console.log('Audit Complete');
  console.log(`Total pages scraped: ${results.length}`);
  console.log(`Thin content pages: ${results.filter(r => r.thinContent === 'YES').length}`);
  console.log(`SSR problems: ${results.filter(r => r.ssrProblem === 'YES').length}`);
  console.log(`Broken pages: ${results.filter(r => r.statusCode === 404).length}`);
  console.log(`Titles too long: ${results.filter(r => r.titleStatus === 'Too Long').length}`);
  console.log(`Missing descriptions: ${results.filter(r => r.descriptionStatus === 'Missing').length}`);
  console.log(`Multiple H1 pages: ${results.filter(r => r.h1Count > 1).length}`);
  console.log('audit.csv saved successfully');
  console.log('——————————————————————————');
}

main();
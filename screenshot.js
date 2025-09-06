import { chromium } from 'playwright';

async function takeScreenshot() {
  console.log('Launching browser...');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  console.log('Navigating to http://localhost:5173/...');
  try {
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
    
    // Wait a bit more to ensure everything is loaded
    await page.waitForTimeout(2000);
    
    console.log('Taking screenshot...');
    await page.screenshot({ 
      path: 'blinky-app-screenshot.png',
      fullPage: true 
    });
    
    console.log('Screenshot saved as blinky-app-screenshot.png');
  } catch (error) {
    console.error('Error taking screenshot:', error.message);
  }
  
  await browser.close();
}

takeScreenshot();
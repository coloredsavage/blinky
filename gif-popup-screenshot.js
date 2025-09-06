import { chromium } from 'playwright';

async function captureGifPopups() {
  console.log('🚀 Launching browser...');
  const browser = await chromium.launch({ headless: false }); // Set to false to see what's happening
  const page = await browser.newPage();
  
  try {
    // Set viewport size for consistent screenshots
    await page.setViewportSize({ width: 1280, height: 800 });
    
    console.log('🌐 Navigating to http://localhost:5173/...');
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 30000 });
    
    // Wait for page to fully load
    await page.waitForTimeout(2000);
    
    console.log('🎯 Looking for "Single Player" button...');
    
    // Wait for and click the Single Player button
    const singlePlayerButton = page.locator('text=Single Player').or(page.locator('[class*="single"]')).or(page.locator('button:has-text("Single Player")')).first();
    await singlePlayerButton.waitFor({ timeout: 10000 });
    await singlePlayerButton.click();
    
    console.log('✅ Clicked "Single Player" button');
    
    console.log('⏳ Waiting for game screen to load...');
    // Wait for game screen elements to appear
    await page.waitForSelector('video, canvas, [class*="manga"], [class*="game"]', { timeout: 15000 });
    await page.waitForTimeout(3000); // Additional time for camera and face detection to initialize
    
    console.log('🔍 Looking for test buttons at the bottom...');
    
    // Look for the test buttons - try multiple selectors
    const testButtonSelectors = [
      'text=2 Ads',
      'text=6 Ads', 
      'text=15 Ads',
      'button:has-text("2 Ads")',
      'button:has-text("6 Ads")',
      'button:has-text("15 Ads")',
      '[class*="btn-secondary"]:has-text("Ads")',
    ];
    
    let testButton = null;
    for (const selector of testButtonSelectors) {
      try {
        testButton = page.locator(selector).first();
        await testButton.waitFor({ timeout: 5000 });
        console.log(`🎯 Found test button with selector: ${selector}`);
        break;
      } catch (e) {
        console.log(`⚠️  Test button not found with selector: ${selector}`);
      }
    }
    
    if (!testButton) {
      console.log('🔍 Trying to find any button containing "Ads"...');
      testButton = page.locator('button').filter({ hasText: 'Ads' }).first();
      await testButton.waitFor({ timeout: 5000 });
    }
    
    if (!testButton) {
      throw new Error('Could not find any test buttons for creating GIF popups');
    }
    
    console.log('🖱️  Clicking test button to trigger GIF popups...');
    await testButton.click();
    
    console.log('⏳ Waiting for GIF popups to appear...');
    // Wait for popups/distractions to appear - look for various possible selectors
    const popupSelectors = [
      '[class*="distraction"]',
      '[class*="popup"]',
      '[class*="overlay"]',
      'img[src*="gif"]',
      '[class*="modal"]',
      'text=Click Here!',
      'button:has-text("Click Here!")',
    ];
    
    let popupsFound = false;
    for (const selector of popupSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        console.log(`✅ Found popup element with selector: ${selector}`);
        popupsFound = true;
        break;
      } catch (e) {
        console.log(`⚠️  No popup found with selector: ${selector}`);
      }
    }
    
    // Give extra time for animations and multiple popups to appear
    await page.waitForTimeout(2000);
    
    console.log('📸 Taking screenshot to capture GIF popups...');
    await page.screenshot({ 
      path: 'gif-popup-screenshot.png',
      fullPage: true
    });
    
    console.log('✅ Screenshot saved as gif-popup-screenshot.png');
    
    if (popupsFound) {
      console.log('🎉 Successfully captured GIF popups with "Click Here!" buttons');
    } else {
      console.log('⚠️  Screenshot taken, but popup elements may not be visible or may use different selectors');
    }
    
  } catch (error) {
    console.error('❌ Error during automation:', error.message);
    
    // Take a screenshot anyway to help debug
    console.log('📸 Taking debug screenshot...');
    try {
      await page.screenshot({ 
        path: 'debug-screenshot.png',
        fullPage: true 
      });
      console.log('📋 Debug screenshot saved as debug-screenshot.png');
    } catch (screenshotError) {
      console.error('❌ Could not take debug screenshot:', screenshotError.message);
    }
  }
  
  await browser.close();
  console.log('🏁 Browser closed');
}

captureGifPopups();
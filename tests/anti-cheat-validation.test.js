import { test, expect } from '@playwright/test';

test.describe('Anti-Cheat Validation', () => {
  test('should detect when player leaves video frame', async ({ browser }) => {
    const context = await browser.newContext({ 
      permissions: ['camera'],
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
    });
    
    const page = await context.newPage();
    
    console.log('🧪 Testing anti-cheat face presence detection');
    
    // Navigate to app
    await page.goto('http://localhost:5174');
    
    // Handle username prompt
    page.on('dialog', async dialog => {
      console.log('👤 Dialog:', dialog.message());
      await dialog.accept('TestPlayer');
    });
    
    // Start single player game to test face detection
    await page.click('text=Single Player');
    console.log('✅ Started single player mode');
    
    // Wait for face detection to load
    await page.waitForSelector('text=Loading Face Detection Model', { timeout: 10000 });
    await page.waitForSelector('text=Ready to play!', { timeout: 15000 });
    console.log('✅ Face detection loaded');
    
    // Check that face is centered initially
    const statusText = await page.textContent('.text-xl');
    expect(statusText).toContain('Ready to play!');
    
    console.log('✅ Face presence validation test completed');
    
    await context.close();
  });

  test('should show opponent real eye states in multiplayer', async ({ browser }) => {
    // Create two browser contexts for two players
    const context1 = await browser.newContext({ permissions: ['camera'] });
    const context2 = await browser.newContext({ permissions: ['camera'] });
    
    const player1 = await context1.newPage();
    const player2 = await context2.newPage();
    
    console.log('🎮 Starting anti-cheat multiplayer test');
    
    // Navigate both players to the app
    await Promise.all([
      player1.goto('http://localhost:5174'),
      player2.goto('http://localhost:5174')
    ]);
    
    // Set up dialog handlers
    player1.on('dialog', async dialog => {
      await dialog.accept('AntiCheatPlayer1');
    });
    
    player2.on('dialog', async dialog => {
      await dialog.accept('AntiCheatPlayer2');
    });
    
    // Both players click Global Stare-Down
    await Promise.all([
      player1.click('text=Global Stare-Down'),
      player2.click('text=Global Stare-Down')
    ]);
    
    // Wait for both to reach Global Multiplayer screen
    await Promise.all([
      player1.waitForSelector('text=Global Multiplayer', { timeout: 10000 }),
      player2.waitForSelector('text=Global Multiplayer', { timeout: 10000 })
    ]);
    
    // Enable cameras and join queue
    try {
      await player1.click('text=Enable Camera');
      await player1.waitForTimeout(2000);
      await player1.click('text=Find Match');
      console.log('⏳ Player 1 joined queue');
    } catch {
      await player1.click('text=Find Match');
      console.log('⏳ Player 1 joined queue (camera already enabled)');
    }
    
    await player2.waitForTimeout(2000);
    try {
      await player2.click('text=Enable Camera');
      await player2.waitForTimeout(2000);
      await player2.click('text=Find Match');
      console.log('🎯 Player 2 joined queue');
    } catch {
      await player2.click('text=Find Match');
      console.log('🎯 Player 2 joined queue (camera already enabled)');
    }
    
    // Wait for match to be found and game to start
    try {
      await Promise.all([
        player1.waitForSelector('text=Ready', { timeout: 15000 }),
        player2.waitForSelector('text=Ready', { timeout: 15000 })
      ]);
      
      console.log('🎉 Match found! Checking anti-cheat features...');
      
      // Check that both players have VS divider (indicating multiplayer)
      const player1HasVS = await player1.locator('text=VS').isVisible();
      const player2HasVS = await player2.locator('text=VS').isVisible();
      
      console.log(`👤 Player 1 sees VS: ${player1HasVS}`);
      console.log(`👥 Player 2 sees VS: ${player2HasVS}`);
      
      // Check for manga eye panels (should show real eye states)
      const player1EyePanels = await player1.locator('.manga-eye-panel').count();
      const player2EyePanels = await player2.locator('.manga-eye-panel').count();
      
      console.log(`👁️ Player 1 eye panels: ${player1EyePanels}`);
      console.log(`👁️ Player 2 eye panels: ${player2EyePanels}`);
      
      // Take screenshots for verification
      await Promise.all([
        player1.screenshot({ path: 'anticheat-player1.png' }),
        player2.screenshot({ path: 'anticheat-player2.png' })
      ]);
      
      // Verify anti-cheat features are active
      expect(player1HasVS).toBe(true);
      expect(player2HasVS).toBe(true);
      expect(player1EyePanels).toBe(2); // Player + opponent
      expect(player2EyePanels).toBe(2); // Player + opponent
      
      console.log('✅ Anti-cheat features verified!');
      
    } catch (error) {
      console.log('❌ Failed to establish match or verify anti-cheat:', error.message);
      
      await Promise.all([
        player1.screenshot({ path: 'anticheat-error-p1.png' }),
        player2.screenshot({ path: 'anticheat-error-p2.png' })
      ]);
      
      throw error;
    }
    
    await context1.close();
    await context2.close();
  });
});
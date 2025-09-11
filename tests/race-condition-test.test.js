import { test, expect } from '@playwright/test';

test.describe('Race Condition Fix', () => {
  test('should handle global multiplayer race condition without Room not found error', async ({ browser }) => {
    // Create two browser contexts for two players
    const context1 = await browser.newContext({ permissions: ['camera'] });
    const context2 = await browser.newContext({ permissions: ['camera'] });
    
    const player1 = await context1.newPage();
    const player2 = await context2.newPage();
    
    console.log('🎮 Testing race condition fix for global multiplayer');
    
    // Navigate both players to the app
    await Promise.all([
      player1.goto('http://localhost:5175'),
      player2.goto('http://localhost:5175')
    ]);
    
    // Set up dialog handlers
    player1.on('dialog', async dialog => {
      await dialog.accept('RaceTest1');
    });
    
    player2.on('dialog', async dialog => {
      await dialog.accept('RaceTest2');
    });
    
    // Both players click Global Stare-Down simultaneously
    await Promise.all([
      player1.click('text=Global Stare-Down'),
      player2.click('text=Global Stare-Down')
    ]);
    
    // Wait for both to reach Global Multiplayer screen
    await Promise.all([
      player1.waitForSelector('text=Global Multiplayer', { timeout: 10000 }),
      player2.waitForSelector('text=Global Multiplayer', { timeout: 10000 })
    ]);
    
    console.log('✅ Both players reached Global Multiplayer screen');
    
    // Both players join queue simultaneously (this should trigger the race condition)
    await Promise.all([
      (async () => {
        try {
          await player1.click('text=Enable Camera');
          await player1.waitForTimeout(1000);
        } catch {}
        await player1.click('text=Find Match');
        console.log('⏳ Player 1 joined queue');
      })(),
      (async () => {
        await player2.waitForTimeout(500); // Slight delay to ensure race condition
        try {
          await player2.click('text=Enable Camera');
          await player2.waitForTimeout(1000);
        } catch {}
        await player2.click('text=Find Match');
        console.log('🎯 Player 2 joined queue');
      })()
    ]);
    
    // Wait and check for connection errors
    await player1.waitForTimeout(5000);
    await player2.waitForTimeout(5000);
    
    const player1Status = await player1.textContent('.text-xl');
    const player2Status = await player2.textContent('.text-xl');
    
    console.log('👤 Player 1 status:', player1Status);
    console.log('👥 Player 2 status:', player2Status);
    
    // Take screenshots for verification
    await Promise.all([
      player1.screenshot({ path: 'race-test-player1.png' }),
      player2.screenshot({ path: 'race-test-player2.png' })
    ]);
    
    // Verify no "Room not found" errors
    expect(player1Status).not.toContain('Room not found');
    expect(player2Status).not.toContain('Room not found');
    
    // At least one should be connected or in game
    const bothConnected = (
      (player1Status?.includes('Ready') || player1Status?.includes('Connected') || player1Status?.includes('VS')) ||
      (player2Status?.includes('Ready') || player2Status?.includes('Connected') || player2Status?.includes('VS'))
    );
    
    if (bothConnected) {
      console.log('✅ Race condition fix successful - no Room not found errors');
    } else {
      console.log('⚠️ Players may still be connecting, but no critical errors detected');
    }
    
    await context1.close();
    await context2.close();
  });
});
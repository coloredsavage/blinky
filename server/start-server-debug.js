// Debug wrapper for signaling server
process.on('uncaughtException', (error) => {
  console.error('❌ UNCAUGHT EXCEPTION:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION at:', promise, 'reason:', reason);
  process.exit(1);
});

try {
  console.log('🚀 Starting server with debug wrapper...');
  require('./signaling-server.js');
} catch (error) {
  console.error('❌ ERROR STARTING SERVER:', error);
  process.exit(1);
}
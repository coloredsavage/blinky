const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configure CORS for Socket.IO
const io = socketIo(server, {
  cors: {
    origin: [
      "http://localhost:5173", 
      "http://localhost:3000",
      "https://blinky.vercel.app",
      "https://blinky-react.vercel.app"
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Store rooms and connected users
const rooms = new Map();
const users = new Map();

// Global multiplayer systems
const globalQueue = new Map(); // Players waiting for global match
const activeGlobalMatches = new Map(); // Ongoing global matches
const playerStats = new Map(); // Player statistics and ELO
const leaderboard = []; // Global leaderboard

// Continuous run systems
const continuousRuns = new Map(); // Active continuous runs
const continuousQueue = new Map(); // Players waiting for continuous matches
const nextOpponentCache = new Map(); // Pre-fetched next opponents for runs

// Continuous run utility functions
function generateRunId() {
  return 'RUN_' + Math.random().toString(36).substr(2, 9).toUpperCase();
}

function findContinuousOpponent(runId, playerSocketId, playerUsername, playerElo) {
  const ELO_RANGE = 150; // Wider range for continuous matches
  
  // Check pre-fetched opponents first
  const preFetched = nextOpponentCache.get(runId);
  if (preFetched) {
    console.log('📥 Using pre-fetched opponent for run:', runId);
    nextOpponentCache.delete(runId);
    return preFetched;
  }
  
  // Search in continuous queue
  for (const [queuedSocketId, queuedPlayer] of continuousQueue) {
    if (queuedSocketId === playerSocketId) continue;
    
    const eloDifference = Math.abs(playerElo - queuedPlayer.elo);
    if (eloDifference <= ELO_RANGE) {
      return { socketId: queuedSocketId, ...queuedPlayer };
    }
  }
  
  return null;
}

function preFetchNextOpponent(runId, playerElo) {
  // Look for potential next opponent in continuous queue
  for (const [queuedSocketId, queuedPlayer] of continuousQueue) {
    const eloDifference = Math.abs(playerElo - queuedPlayer.elo);
    if (eloDifference <= 150) {
      console.log('📥 Pre-fetching next opponent for run:', runId);
      nextOpponentCache.set(runId, { socketId: queuedSocketId, ...queuedPlayer });
      return true;
    }
  }
  return false;
}

// ELO rating system constants
const INITIAL_ELO = 1000;
const K_FACTOR = 32;

// Anti-cheat validation constants
const MAX_BLINK_FREQUENCY = 5; // Max blinks per second
const MIN_GAME_DURATION = 1000; // Minimum game duration in ms
const MAX_GAME_DURATION = 300000; // Maximum game duration in ms (5 minutes)
const SUSPICIOUS_PATTERN_THRESHOLD = 3; // Number of suspicious patterns before flagging

// Anti-cheat tracking
const playerBlinkHistory = new Map(); // Track blink frequency per player
const suspiciousPlayers = new Map(); // Track suspicious behavior patterns

// Anti-cheat validation functions
function validateBlinkFrequency(playerSocketId, timestamp) {
  if (!playerBlinkHistory.has(playerSocketId)) {
    playerBlinkHistory.set(playerSocketId, []);
  }
  
  const blinks = playerBlinkHistory.get(playerSocketId);
  blinks.push(timestamp);
  
  // Keep only last 10 seconds of blink history
  const tenSecondsAgo = Date.now() - 10000;
  const recentBlinks = blinks.filter(blinkTime => blinkTime > tenSecondsAgo);
  playerBlinkHistory.set(playerSocketId, recentBlinks);
  
  // Check if blink frequency is suspicious
  if (recentBlinks.length > MAX_BLINK_FREQUENCY * 10) { // 10-second window
    console.log(`🚨 Suspicious blink frequency detected for ${playerSocketId}: ${recentBlinks.length} blinks in 10s`);
    flagSuspiciousBehavior(playerSocketId, 'high_blink_frequency');
    return false;
  }
  
  return true;
}

function validateGameDuration(gameTime) {
  if (gameTime < MIN_GAME_DURATION || gameTime > MAX_GAME_DURATION) {
    console.log(`🚨 Suspicious game duration: ${gameTime}ms`);
    return false;
  }
  return true;
}

function validateGameResult(result, gameTime, winner) {
  // Basic validation
  if (!winner || !gameTime || typeof gameTime !== 'number') {
    console.log('🚨 Invalid game result format');
    return false;
  }
  
  // Validate game duration
  if (!validateGameDuration(gameTime)) {
    return false;
  }
  
  // Check for impossible win times (too fast)
  if (gameTime < 500) { // Less than 0.5 seconds
    console.log(`🚨 Suspiciously fast win: ${gameTime}ms`);
    return false;
  }
  
  return true;
}

function flagSuspiciousBehavior(playerSocketId, reason) {
  if (!suspiciousPlayers.has(playerSocketId)) {
    suspiciousPlayers.set(playerSocketId, []);
  }
  
  const behaviors = suspiciousPlayers.get(playerSocketId);
  behaviors.push({
    timestamp: Date.now(),
    reason,
    severity: 'medium'
  });
  
  console.log(`🚨 Flagged suspicious behavior for ${playerSocketId}: ${reason}`);
  
  // If too many suspicious behaviors, take action
  if (behaviors.length >= SUSPICIOUS_PATTERN_THRESHOLD) {
    console.log(`🚨 Multiple suspicious behaviors detected for ${playerSocketId}, taking action`);
    // In a production system, you might:
    // - Temporarily ban the player
    // - Reset their stats
    // - Flag for manual review
  }
}

function resetPlayerBlinkHistory(playerSocketId) {
  playerBlinkHistory.delete(playerSocketId);
}

// Utility functions for global multiplayer
function generateGlobalMatchId() {
  return 'GM_' + Math.random().toString(36).substr(2, 9).toUpperCase();
}

function calculateEloChange(playerRating, opponentRating, result) {
  const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
  return Math.round(K_FACTOR * (result - expectedScore));
}

function getOrCreatePlayerStats(username) {
  if (!playerStats.has(username)) {
    playerStats.set(username, {
      username,
      elo: INITIAL_ELO,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      longestStare: 0,
      totalPlayTime: 0,
      joinedDate: new Date().toISOString()
    });
  }
  return playerStats.get(username);
}

function updateLeaderboard() {
  const sortedPlayers = Array.from(playerStats.values())
    .filter(player => player.gamesPlayed >= 5) // Minimum games for ranking
    .sort((a, b) => b.elo - a.elo)
    .slice(0, 100); // Top 100 players
  
  leaderboard.length = 0;
  leaderboard.push(...sortedPlayers);
}

function findGlobalMatch(playerSocketId, playerUsername, playerElo) {
  const ELO_RANGE = 100; // Initial ELO range for matchmaking
  
  for (const [queuedSocketId, queuedPlayer] of globalQueue) {
    if (queuedSocketId === playerSocketId) continue; // Don't match with self
    
    const eloDifference = Math.abs(playerElo - queuedPlayer.elo);
    if (eloDifference <= ELO_RANGE) {
      // Found a match!
      return { socketId: queuedSocketId, ...queuedPlayer };
    }
  }
  
  return null; // No suitable match found
}

io.on('connection', (socket) => {
  console.log(`🔌 NEW USER CONNECTED: ${socket.id}`);
  console.log('📊 Total connected users:', users.size + 1);
  
  // Store user info
  users.set(socket.id, { socketId: socket.id, username: null, roomId: null });
  
  // Acknowledge connection
  socket.emit('connection-confirmed', { socketId: socket.id });

  // Handle room creation
  socket.on('create-room', (data) => {
    const { roomId, username } = data;
    console.log(`🏠 Creating room: ${roomId} by ${username}`);
    
    // Check if this is a global match ID
    const globalMatch = activeGlobalMatches.get(roomId);
    if (globalMatch) {
      console.log('🌍 This is a global match, not creating traditional room');
      // For global matches, update the player's WebRTC socket ID
      const playerInMatch = globalMatch.players.find(p => p.username === username);
      if (playerInMatch) {
        console.log(`✅ Host ${username} confirmed for global match`);

        // Update this player's WebRTC socket ID (they're connecting via useSimplePeer now)
        playerInMatch.webrtcSocketId = socket.id;
        socket.join(roomId);

        console.log(`📊 Global match ${roomId} WebRTC connection status:`,
          globalMatch.players.map(p => ({ username: p.username, hasWebRTC: !!p.webrtcSocketId })));

        socket.emit('room-created', {
          roomId,
          users: globalMatch.players.map(p => ({ socketId: p.webrtcSocketId || p.socketId, username: p.username }))
        });

        // Check if both players now have WebRTC sockets connected
        const bothPlayersConnected = globalMatch.players.every(p => p.webrtcSocketId);
        if (bothPlayersConnected && !globalMatch.webrtcTriggered) {
          console.log('🎯 BOTH PLAYERS CONNECTED VIA WEBRTC SOCKETS - Triggering peer connection');
          const [host, guest] = globalMatch.players;
          // Tell the host to create peer connection to guest
          console.log(`📤 Telling ${host.username} (${host.webrtcSocketId}) to create peer connection to ${guest.username} (${guest.webrtcSocketId})`);
          io.to(host.webrtcSocketId).emit('create-peer-connection', {
            targetSocketId: guest.webrtcSocketId
          });
          // Mark as triggered to prevent duplicates
          globalMatch.webrtcTriggered = true;
        } else if (globalMatch.webrtcTriggered) {
          console.log('⏭️  WebRTC already triggered for this match, skipping duplicate');
        } else {
          console.log('⏳ Waiting for other player to connect via WebRTC socket...');
        }

        return;
      } else {
        console.log('❌ Player not part of this global match');
        socket.emit('room-error', { message: 'Not authorized for this match' });
        return;
      }
    }
    
    // Update user info
    users.set(socket.id, { socketId: socket.id, username, roomId });
    
    // Create room if it doesn't exist
    if (!rooms.has(roomId)) {
      rooms.set(roomId, { users: [], host: socket.id });
      const room = rooms.get(roomId);
      
      // Add user to room only when creating new room
      room.users.push({ socketId: socket.id, username });
      socket.join(roomId);
      
      console.log(`👤 ${username} created and joined room ${roomId}`);
      socket.emit('room-created', { roomId, users: room.users });
    } else {
      // Room already exists, check if user is already in it
      const room = rooms.get(roomId);
      const userExists = room.users.find(u => u.socketId === socket.id);
      
      if (!userExists) {
        // User not in room, add them
        room.users.push({ socketId: socket.id, username });
        socket.join(roomId);
        console.log(`👤 ${username} joined existing room ${roomId}`);
      } else {
        console.log(`👤 ${username} already in room ${roomId}, skipping duplicate`);
      }
      
      socket.emit('room-created', { roomId, users: room.users });
    }
  });

  // Handle room joining
  socket.on('join-room', (data) => {
    const { roomId, username } = data;
    console.log(`🚪 RECEIVED join-room event: ${username} attempting to join room: ${roomId}`);
    console.log('📊 Current rooms:', Array.from(rooms.keys()));
    console.log('📊 Current global matches:', Array.from(activeGlobalMatches.keys()));
    console.log('📊 Room data:', data);
    
    // Check if this is a global match ID
    const globalMatch = activeGlobalMatches.get(roomId);
    if (globalMatch) {
      console.log('🌍 Found global match:', globalMatch);
      // For global matches, update the player's WebRTC socket ID
      const playerInMatch = globalMatch.players.find(p => p.username === username);
      if (playerInMatch) {
        console.log(`✅ Guest ${username} is part of this global match`);

        // Update this player's WebRTC socket ID (they're connecting via useSimplePeer now)
        playerInMatch.webrtcSocketId = socket.id;
        socket.join(roomId);

        console.log(`📊 Global match ${roomId} WebRTC connection status:`,
          globalMatch.players.map(p => ({ username: p.username, hasWebRTC: !!p.webrtcSocketId })));

        socket.emit('room-joined', {
          roomId,
          users: globalMatch.players.map(p => ({ socketId: p.webrtcSocketId || p.socketId, username: p.username }))
        });

        // Check if both players now have WebRTC sockets connected
        const bothPlayersConnected = globalMatch.players.every(p => p.webrtcSocketId);
        if (bothPlayersConnected && !globalMatch.webrtcTriggered) {
          console.log('🎯 BOTH PLAYERS CONNECTED VIA WEBRTC SOCKETS - Triggering peer connection');
          const [host, guest] = globalMatch.players;
          // Tell the host to create peer connection to guest
          console.log(`📤 Telling ${host.username} (${host.webrtcSocketId}) to create peer connection to ${guest.username} (${guest.webrtcSocketId})`);
          io.to(host.webrtcSocketId).emit('create-peer-connection', {
            targetSocketId: guest.webrtcSocketId
          });
          // Mark as triggered to prevent duplicates
          globalMatch.webrtcTriggered = true;
        } else if (globalMatch.webrtcTriggered) {
          console.log('⏭️  WebRTC already triggered for this match, skipping duplicate');
        } else {
          console.log('⏳ Waiting for other player to connect via WebRTC socket...');
        }

        return;
      } else {
        console.log('❌ Player not part of this global match');
        socket.emit('room-error', { message: 'Not authorized for this match' });
        return;
      }
    }
    
    const room = rooms.get(roomId);
    console.log('🏠 Found room:', room ? `Yes (${room.users.length} users)` : 'No');
    
    if (!room) {
      console.log('❌ Room not found, sending error');
      socket.emit('room-error', { message: 'Room not found' });
      return;
    }
    
    // Check if user is already in the room
    const userAlreadyInRoom = room.users.find(u => u.username === username);
    if (userAlreadyInRoom) {
      console.log(`👤 ${username} is already in room ${roomId}, skipping duplicate join`);
      socket.emit('room-joined', { roomId, users: room.users });
      return;
    }
    
    if (room.users.length >= 2) {
      console.log('❌ Room is full, sending error');
      socket.emit('room-error', { message: 'Room is full' });
      return;
    }
    
    // Update user info
    users.set(socket.id, { socketId: socket.id, username, roomId });
    
    // Add user to room
    room.users.push({ socketId: socket.id, username });
    socket.join(roomId);
    
    console.log(`✅ ${username} successfully added to room ${roomId}`);
    console.log('👥 Room users now:', room.users);
    
    // Notify all users in room
    console.log('📤 Sending user-joined event to room');
    socket.to(roomId).emit('user-joined', { username, socketId: socket.id });
    
    console.log('📤 Sending room-joined confirmation to user');
    socket.emit('room-joined', { roomId, users: room.users });
    
    console.log(`👤 ${username} joined room ${roomId} successfully`);
    
    // If room now has 2 users, tell the first user to create peer connection
    if (room.users.length === 2) {
      const otherUser = room.users.find(u => u.socketId !== socket.id);
      console.log('🔗 Room now has 2 users, initiating peer connection');
      console.log('🎯 Other user:', otherUser);
      if (otherUser) {
        // Tell the first user (host) to initiate peer connection
        console.log(`📤 Telling ${otherUser.socketId} to create peer connection to ${socket.id}`);
        io.to(otherUser.socketId).emit('create-peer-connection', { 
          targetSocketId: socket.id 
        });
      }
    }
  });

  // Handle WebRTC signaling
  socket.on('webrtc-offer', (data) => {
    console.log(`📡 Relaying WebRTC offer from ${socket.id} to ${data.target}`);
    socket.to(data.target).emit('webrtc-offer', { 
      offer: data.offer, 
      from: socket.id 
    });
  });

  socket.on('webrtc-answer', (data) => {
    console.log(`📡 Relaying WebRTC answer from ${socket.id} to ${data.target}`);
    socket.to(data.target).emit('webrtc-answer', { 
      answer: data.answer, 
      from: socket.id 
    });
  });

  socket.on('webrtc-ice-candidate', (data) => {
    console.log(`🧊 Relaying ICE candidate from ${socket.id} to ${data.target}`);
    socket.to(data.target).emit('webrtc-ice-candidate', {
      candidate: data.candidate,
      from: socket.id
    });
  });

  // Socket.IO fallback for game messages (when WebRTC data channel fails)
  socket.on('ready-state', (data) => {
    console.log(`🔄 Relaying ready-state from ${socket.id}`, data);
    let foundRoom = false;

    // Check traditional rooms first
    for (const [roomId, room] of rooms.entries()) {
      if (room.users.some(u => u.socketId === socket.id)) {
        foundRoom = true;
        console.log(`✅ Found socket in traditional room ${roomId}`);
        room.users.forEach(user => {
          if (user.socketId !== socket.id) {
            console.log(`📤 Relaying ready-state to ${user.socketId} (${user.username})`);
            io.to(user.socketId).emit('ready-state', data);
          }
        });
        break;
      }
    }

    // If not found in traditional rooms, check global matches
    if (!foundRoom) {
      for (const [matchId, match] of activeGlobalMatches.entries()) {
        const player = match.players.find(p => p.webrtcSocketId === socket.id);
        if (player) {
          foundRoom = true;
          console.log(`✅ Found socket in global match ${matchId} (player: ${player.username})`);
          // Relay to other player in the match
          const otherPlayer = match.players.find(p => p.webrtcSocketId !== socket.id);
          if (otherPlayer && otherPlayer.webrtcSocketId) {
            console.log(`📤 Relaying ready-state to ${otherPlayer.webrtcSocketId} (${otherPlayer.username})`);
            io.to(otherPlayer.webrtcSocketId).emit('ready-state', data);
          }
          break;
        }
      }
    }

      if (!foundRoom) {
      console.log(`❌ Socket ${socket.id} not found in any room or match`);
    }
  });

  // Game message handler (for BLINK, READY_STATE, etc.)
  socket.on('game-message', (data) => {
    console.log(`📨 Relaying game-message from ${socket.id}`, data);
    let foundRoom = false;

    // Check traditional rooms first
    for (const [roomId, room] of rooms.entries()) {
      if (room.users.some(u => u.socketId === socket.id)) {
        foundRoom = true;
        console.log(`✅ Found socket in traditional room ${roomId}`);
        room.users.forEach(user => {
          if (user.socketId !== socket.id) {
            console.log(`📤 Relaying game-message (${data.type}) to ${user.socketId} (${user.username})`);
            io.to(user.socketId).emit('game-message', data);
          }
        });
        break;
      }
    }

    // If not found in traditional rooms, check global matches
    if (!foundRoom) {
      for (const [matchId, match] of activeGlobalMatches.entries()) {
        const player = match.players.find(p => p.webrtcSocketId === socket.id);
        if (player) {
          foundRoom = true;
          console.log(`✅ Found socket in global match ${matchId} (player: ${player.username})`);
          // Relay to other player in the match
          const otherPlayer = match.players.find(p => p.webrtcSocketId !== socket.id);
          if (otherPlayer && otherPlayer.webrtcSocketId) {
            console.log(`📤 Relaying game-message (${data.type}) to ${otherPlayer.webrtcSocketId} (${otherPlayer.username})`);
            io.to(otherPlayer.webrtcSocketId).emit('game-message', data);
          }
          break;
        }
      }
    }

    if (!foundRoom) {
      console.log(`❌ Socket ${socket.id} not found in any room or match`);
    }
  });

  // Global matchmaking handlers
  socket.on('join-global-queue', (data) => {
    const { username } = data;
    console.log(`🌍 ${username} joining global queue`);
    
    const playerStats = getOrCreatePlayerStats(username);
    const playerData = {
      username,
      elo: playerStats.elo,
      joinTime: Date.now()
    };
    
    // Try to find an immediate match
    const opponent = findGlobalMatch(socket.id, username, playerStats.elo);
    
    if (opponent) {
      // Match found! Create global match
      const matchId = generateGlobalMatchId();
      console.log(`🎯 Global match found: ${username} (${playerStats.elo}) vs ${opponent.username} (${opponent.elo})`);
      
      // Remove opponent from queue
      globalQueue.delete(opponent.socketId);
      
      // Create match record
      activeGlobalMatches.set(matchId, {
        matchId,
        players: [
          { socketId: socket.id, username, elo: playerStats.elo },
          { socketId: opponent.socketId, username: opponent.username, elo: opponent.elo }
        ],
        startTime: Date.now(),
        gameState: 'starting',
        webrtcTriggered: false // Initialize the flag to prevent duplicate triggers
      });
      
      // Notify both players
      socket.emit('global-match-found', { 
        matchId, 
        opponent: { username: opponent.username, elo: opponent.elo },
        isHost: false
      });
      
      io.to(opponent.socketId).emit('global-match-found', { 
        matchId, 
        opponent: { username, elo: playerStats.elo },
        isHost: true
      });
      
      // Set up WebRTC signaling for this match
      socket.join(matchId);
      io.to(opponent.socketId).socketsJoin(matchId);
      
      // Tell host to initiate peer connection
      io.to(opponent.socketId).emit('create-peer-connection', { 
        targetSocketId: socket.id,
        matchId
      });
      
    } else {
      // No match found, add to queue
      globalQueue.set(socket.id, playerData);
      console.log(`⏳ ${username} added to global queue (${globalQueue.size} players waiting)`);
      
      socket.emit('global-queue-joined', { 
        queuePosition: globalQueue.size,
        estimatedWait: Math.max(5, globalQueue.size * 2) // Rough estimate
      });
    }
  });
  
  socket.on('leave-global-queue', () => {
    const user = users.get(socket.id);
    if (globalQueue.has(socket.id)) {
      globalQueue.delete(socket.id);
      console.log(`🚫 ${user?.username || 'User'} left global queue`);
      socket.emit('global-queue-left');
    }
  });
  
  socket.on('global-game-result', (data) => {
    const { matchId, result, gameTime, winner } = data;
    console.log(`🏆 Global game result: Match ${matchId}, Winner: ${winner}, Time: ${gameTime}ms`);
    
    const match = activeGlobalMatches.get(matchId);
    if (!match) {
      console.log('❌ Match not found for result submission');
      return;
    }
    
    // Enhanced anti-cheat validation
    if (!validateGameResult(result, gameTime, winner)) {
      console.log('🚨 Anti-cheat validation failed for game result');
      return;
    }
    
    // Validate blink frequency for winner
    const winnerPlayer = match.players.find(p => p.username === winner);
    if (winnerPlayer) {
      if (!validateBlinkFrequency(winnerPlayer.socketId, Date.now())) {
        console.log(`🚨 Suspicious blink frequency for winner ${winner}`);
        return;
      }
    }
    
    // Update player statistics
    const [player1, player2] = match.players;
    const winner1 = winner === player1.username;
    const winner2 = winner === player2.username;
    
    if (winner1 || winner2) {
      // Calculate ELO changes
      const player1EloChange = calculateEloChange(player1.elo, player2.elo, winner1 ? 1 : 0);
      const player2EloChange = calculateEloChange(player2.elo, player1.elo, winner2 ? 1 : 0);
      
      // Update stats
      const stats1 = getOrCreatePlayerStats(player1.username);
      const stats2 = getOrCreatePlayerStats(player2.username);
      
      stats1.elo += player1EloChange;
      stats1.gamesPlayed++;
      stats1.totalPlayTime += gameTime;
      if (winner1) {
        stats1.wins++;
        stats1.longestStare = Math.max(stats1.longestStare, gameTime);
      } else {
        stats1.losses++;
      }
      
      stats2.elo += player2EloChange;
      stats2.gamesPlayed++;
      stats2.totalPlayTime += gameTime;
      if (winner2) {
        stats2.wins++;
        stats2.longestStare = Math.max(stats2.longestStare, gameTime);
      } else {
        stats2.losses++;
      }
      
      // Update leaderboard
      updateLeaderboard();
      
      // Notify players of stat changes
      io.to(player1.socketId).emit('stats-updated', {
        elo: stats1.elo,
        eloChange: player1EloChange,
        gamesPlayed: stats1.gamesPlayed,
        wins: stats1.wins,
        losses: stats1.losses
      });
      
      io.to(player2.socketId).emit('stats-updated', {
        elo: stats2.elo,
        eloChange: player2EloChange,
        gamesPlayed: stats2.gamesPlayed,
        wins: stats2.wins,
        losses: stats2.losses
      });
      
      console.log(`📊 Stats updated: ${player1.username} (${stats1.elo}, ${player1EloChange > 0 ? '+' : ''}${player1EloChange}), ${player2.username} (${stats2.elo}, ${player2EloChange > 0 ? '+' : ''}${player2EloChange})`);
    }
    
    // Clean up match
    activeGlobalMatches.delete(matchId);
  });

  // Continuous multiplayer handlers
  socket.on('continuous-run:join', (data) => {
    console.log('🔥 SERVER RECEIVED continuous-run:join event from socket:', socket.id);
    console.log('🔥 Event data:', data);
    const { username, runId } = data;
    console.log(`🏃 ${username} starting continuous run: ${runId}`);
    
    const playerStats = getOrCreatePlayerStats(username);
    const playerData = {
      username,
      elo: playerStats.elo,
      joinTime: Date.now()
    };
    
    // Create continuous run record
    continuousRuns.set(runId, {
      runId,
      player: {
        socketId: socket.id,
        username,
        currentTime: 0,
        opponentsDefeated: 0
      },
      currentOpponent: null,
      nextOpponent: null,
      state: 'searching',
      matchHistory: [],
      startTime: Date.now()
    });
    
    // Add to continuous queue
    continuousQueue.set(socket.id, playerData);
    
    // Try to find first opponent
    const opponent = findContinuousOpponent(runId, socket.id, username, playerStats.elo);
    
    if (opponent) {
      // First opponent found!
      console.log(`🎯 First opponent found for ${username}: ${opponent.username}`);

      // Remove BOTH players from queue (they're now in a match)
      continuousQueue.delete(opponent.socketId);
      continuousQueue.delete(socket.id);
      
      // Update run with opponent
      const run = continuousRuns.get(runId);
      run.currentOpponent = {
        username: opponent.username,
        socketId: opponent.socketId,
        elo: opponent.elo
      };
      run.state = 'countdown';
      
      // Create match for WebRTC
      const matchId = generateGlobalMatchId();
      activeGlobalMatches.set(matchId, {
        matchId,
        players: [
          { socketId: socket.id, username, elo: playerStats.elo },
          { socketId: opponent.socketId, username: opponent.username, elo: opponent.elo }
        ],
        startTime: Date.now(),
        gameState: 'starting',
        webrtcTriggered: false,
        isContinuous: true,
        runId: runId
      });

      // Notify both players
      socket.emit('continuous-run:new_opponent', {
        opponent: { username: opponent.username, socketId: opponent.socketId, elo: opponent.elo },
        yourCurrentTime: 0
      });

      io.to(opponent.socketId).emit('continuous-run:new_opponent', {
        opponent: { username, socketId: socket.id, elo: playerStats.elo },
        yourCurrentTime: 0
      });

      // Set up WebRTC signaling
      console.log(`🔗 Setting up WebRTC for continuous match ${matchId}`);
      console.log(`🔗 Player 1 (initiator): ${opponent.socketId} (${opponent.username})`);
      console.log(`🔗 Player 2 (receiver): ${socket.id} (${username})`);

      socket.join(matchId);
      io.to(opponent.socketId).socketsJoin(matchId);

      // Tell host to initiate peer connection
      console.log(`📡 Emitting create-peer-connection to ${opponent.socketId}`);
      io.to(opponent.socketId).emit('create-peer-connection', {
        targetSocketId: socket.id,
        matchId
      });
      console.log(`✅ WebRTC setup complete for continuous match ${matchId}`);

      // Schedule game start timestamp broadcast after 3-second countdown
      setTimeout(() => {
        const gameStartTime = Date.now();
        console.log(`🕐 Broadcasting game start timestamp for continuous match ${matchId}: ${gameStartTime}`);

        // Broadcast synchronized game start timestamp to both players
        socket.emit('continuous-run:game-start', {
          runId,
          startTimestamp: gameStartTime
        });

        io.to(opponent.socketId).emit('continuous-run:game-start', {
          runId,
          startTimestamp: gameStartTime
        });
      }, 3000); // After 3-second countdown
      
    } else {
      // No immediate opponent, wait in queue
      console.log(`⏳ ${username} waiting for first opponent in continuous run`);
      socket.emit('continuous-run:searching_next', {
        opponentsDefeated: 0,
        currentTime: 0
      });
    }
  });
  
  socket.on('continuous-run:find-next', (data) => {
    const { runId, currentTime, opponentsDefeated } = data;
    console.log(`🔍 Finding next opponent for run ${runId} (time: ${currentTime}ms, defeated: ${opponentsDefeated})`);
    
    const run = continuousRuns.get(runId);
    if (!run) {
      console.log('❌ Run not found:', runId);
      return;
    }
    
    // Update run state
    run.player.currentTime = currentTime;
    run.player.opponentsDefeated = opponentsDefeated;
    run.state = 'transitioning';
    
    // Try to find next opponent
    const opponent = findContinuousOpponent(runId, socket.id, run.player.username, run.player.elo);
    
    if (opponent) {
      // Next opponent found!
      console.log(`🎯 Next opponent found for ${run.player.username}: ${opponent.username}`);
      
      // Remove opponent from queue
      continuousQueue.delete(opponent.socketId);
      
      // Update run with new opponent
      run.currentOpponent = {
        username: opponent.username,
        socketId: opponent.socketId,
        elo: opponent.elo
      };
      run.state = 'countdown';
      
      // Create match for WebRTC
      const matchId = generateGlobalMatchId();
      activeGlobalMatches.set(matchId, {
        matchId,
        players: [
          { socketId: socket.id, username: run.player.username, elo: run.player.elo },
          { socketId: opponent.socketId, username: opponent.username, elo: opponent.elo }
        ],
        startTime: Date.now(),
        gameState: 'starting',
        webrtcTriggered: false,
        isContinuous: true,
        runId: runId
      });
      
      // Notify both players
      socket.emit('continuous-run:new_opponent', {
        opponent: { username: opponent.username, socketId: opponent.socketId, elo: opponent.elo },
        yourCurrentTime: currentTime
      });
      
      io.to(opponent.socketId).emit('continuous-run:new_opponent', {
        opponent: { username: run.player.username, socketId: socket.id, elo: run.player.elo },
        yourCurrentTime: 0 // New opponent starts fresh
      });
      
      // Set up WebRTC signaling
      socket.join(matchId);
      io.to(opponent.socketId).socketsJoin(matchId);
      
      // Tell host to initiate peer connection
      io.to(opponent.socketId).emit('create-peer-connection', {
        targetSocketId: socket.id,
        matchId
      });

      // Schedule game start timestamp broadcast after 3-second countdown
      setTimeout(() => {
        const gameStartTime = Date.now();
        console.log(`🕐 Broadcasting game start timestamp for continuous match ${matchId}: ${gameStartTime}`);

        // Broadcast synchronized game start timestamp to both players
        socket.emit('continuous-run:game-start', {
          runId,
          startTimestamp: gameStartTime
        });

        io.to(opponent.socketId).emit('continuous-run:game-start', {
          runId,
          startTimestamp: gameStartTime
        });
      }, 3000); // After 3-second countdown
      
    } else {
      // No opponent found yet, keep searching
      console.log(`⏳ No opponent found yet for ${run.player.username}, continuing search`);
      socket.emit('continuous-run:searching_next', {
        opponentsDefeated: opponentsDefeated,
        currentTime: currentTime
      });
      
      // Try to pre-fetch next opponent
      preFetchNextOpponent(runId, run.player.elo);
    }
  });
  
  socket.on('continuous-run:end', (data) => {
    const { runId, reason } = data;
    console.log(`🏁 Ending continuous run ${runId}: ${reason}`);
    
    const run = continuousRuns.get(runId);
    if (!run) {
      console.log('❌ Run not found for ending:', runId);
      return;
    }
    
    // Record final stats
    if (reason === 'player_lost') {
      const playerStats = getOrCreatePlayerStats(run.player.username);
      playerStats.totalPlayTime += run.player.currentTime;
      playerStats.gamesPlayed++;
      
      // Update longest run if applicable
      if (run.player.currentTime > playerStats.longestStare) {
        playerStats.longestStare = run.player.currentTime;
        console.log(`🏆 New personal best for ${run.player.username}: ${run.player.currentTime}ms`);
      }
      
      // Update leaderboard
      updateLeaderboard();
    }
    
    // Clean up
    continuousRuns.delete(runId);
    continuousQueue.delete(socket.id);
    nextOpponentCache.delete(runId);
    
    console.log(`📊 Continuous run ended for ${run.player.username}: ${run.player.currentTime}ms, ${run.player.opponentsDefeated} opponents defeated`);
  });
  
  socket.on('player:lost', (data) => {
    const { runId, loserSocketId, gameTime } = data;
    console.log(`💀 Player lost in continuous run ${runId}: ${loserSocketId}, Time: ${gameTime}ms`);
    
    const run = continuousRuns.get(runId);
    if (!run) {
      console.log('❌ Run not found for player loss:', runId);
      return;
    }
    
    // Anti-cheat validation for game time
    if (gameTime && !validateGameDuration(gameTime)) {
      console.log('🚨 Suspicious game duration in continuous run');
      return;
    }
    
    if (run.player.socketId === loserSocketId) {
      // Player lost - run ends
      console.log(`🏁 Player ${run.player.username} lost - ending run`);
      socket.emit('continuous-run:end', { runId, reason: 'player_lost' });
    } else if (run.currentOpponent && run.currentOpponent.socketId === loserSocketId) {
      // Opponent lost - find next opponent
      console.log(`🎯 Opponent ${run.currentOpponent.username} lost - finding next challenger`);
      run.player.opponentsDefeated++;
      run.state = 'transitioning';
      
      // Validate blink frequency for winner (the player who didn't lose)
      if (!validateBlinkFrequency(socket.id, Date.now())) {
        console.log(`🚨 Suspicious blink frequency for winner ${run.player.username}`);
        return;
      }
      
      // Notify player to find next opponent
      socket.emit('continuous-run:find-next', {
        runId,
        currentTime: run.player.currentTime,
        opponentsDefeated: run.player.opponentsDefeated
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`🔌 User disconnected: ${socket.id}`);
    
    const user = users.get(socket.id);
    
    // Clean up room-based multiplayer
    if (user && user.roomId) {
      const room = rooms.get(user.roomId);
      if (room) {
        // Remove user from room
        room.users = room.users.filter(u => u.socketId !== socket.id);
        
        // Notify other users
        socket.to(user.roomId).emit('user-left', { 
          username: user.username, 
          socketId: socket.id 
        });
        
        // Remove room if empty
        if (room.users.length === 0) {
          rooms.delete(user.roomId);
          console.log(`🗑️  Removed empty room: ${user.roomId}`);
        }
      }
    }
    
    // Clean up global matchmaking
    if (globalQueue.has(socket.id)) {
      globalQueue.delete(socket.id);
      console.log(`🌍 Removed ${user?.username || 'user'} from global queue`);
    }
    
    // Handle ongoing global matches
    for (const [matchId, match] of activeGlobalMatches) {
      const playerIndex = match.players.findIndex(p => p.socketId === socket.id);
      if (playerIndex !== -1) {
        console.log(`🏃 Player ${user?.username || 'unknown'} disconnected from active match ${matchId}`);
        
        // Notify opponent of disconnection
        const opponent = match.players.find(p => p.socketId !== socket.id);
        if (opponent) {
          io.to(opponent.socketId).emit('opponent-disconnected', {
            matchId,
            reason: 'Player disconnected'
          });
        }
        
        // Clean up match
        activeGlobalMatches.delete(matchId);
        break;
      }
    }
    
    users.delete(socket.id);
  });

  // Health check endpoint
  socket.on('ping', () => {
    socket.emit('pong');
  });
});

// HTTP endpoints for health checks
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    rooms: rooms.size, 
    users: users.size,
    timestamp: new Date().toISOString()
  });
});

app.get('/rooms', (req, res) => {
  const roomList = Array.from(rooms.entries()).map(([roomId, room]) => ({
    roomId,
    userCount: room.users.length,
    users: room.users.map(u => ({ username: u.username, connected: true }))
  }));
  
  res.json({ rooms: roomList });
});

// Global multiplayer endpoints
app.get('/global/stats', (req, res) => {
  res.json({
    totalPlayers: playerStats.size,
    queueSize: globalQueue.size,
    activeMatches: activeGlobalMatches.size,
    gamesPlayed: Array.from(playerStats.values()).reduce((sum, p) => sum + p.gamesPlayed, 0),
    averageElo: Math.round(Array.from(playerStats.values()).reduce((sum, p) => sum + p.elo, 0) / Math.max(playerStats.size, 1))
  });
});

app.get('/global/leaderboard', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json({
    leaderboard: leaderboard.slice(0, limit),
    lastUpdated: new Date().toISOString()
  });
});

app.get('/global/player/:username', (req, res) => {
  const { username } = req.params;
  let stats = playerStats.get(username);
  
  if (!stats) {
    // Create new player stats if they don't exist
    stats = getOrCreatePlayerStats(username);
    console.log(`📊 Created new player stats for: ${username}`);
  }
  
  const rank = leaderboard.findIndex(p => p.username === username) + 1;
  
  res.json({
    ...stats,
    rank: rank > 0 ? rank : null,
    winRate: stats.gamesPlayed > 0 ? Math.round((stats.wins / stats.gamesPlayed) * 100) : 0
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Signaling server running on port ${PORT}`);
  console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🏠 Rooms status: http://localhost:${PORT}/rooms`);
});

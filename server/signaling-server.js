const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configure CORS for Socket.IO
const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
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

// ELO rating system constants
const INITIAL_ELO = 1000;
const K_FACTOR = 32;

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
      // For global matches, just confirm the host connection
      const playerInMatch = globalMatch.players.find(p => p.username === username);
      if (playerInMatch) {
        console.log('✅ Host confirmed for global match');
        socket.emit('room-created', { 
          roomId, 
          users: globalMatch.players.map(p => ({ socketId: p.socketId, username: p.username }))
        });
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
      // For global matches, ensure room exists and handle WebRTC connection
      const playerInMatch = globalMatch.players.find(p => p.username === username);
      if (playerInMatch) {
        console.log('✅ Player is part of this global match');
        
        // Ensure room exists for global match (create if needed)
        let room = rooms.get(roomId);
        if (!room) {
          console.log('🏠 Creating room for global match:', roomId);
          room = { 
            roomId, 
            users: [],
            isGlobalMatch: true 
          };
          rooms.set(roomId, room);
        }
        
        // Add player to room if not already present
        const userAlreadyInRoom = room.users.find(u => u.username === username);
        if (!userAlreadyInRoom) {
          room.users.push({ socketId: socket.id, username });
          socket.join(roomId);
          console.log(`✅ ${username} successfully added to room ${roomId}`);
        } else {
          console.log(`👤 ${username} is already in room ${roomId}, skipping duplicate join`);
        }
        
        console.log('👥 Room users now:', room.users);
        console.log('📤 Sending user-joined event to room');
        socket.to(roomId).emit('user-joined', { socketId: socket.id, username });
        
        console.log('📤 Sending room-joined confirmation to user');
        socket.emit('room-joined', { 
          roomId, 
          users: room.users
        });
        
        console.log(`👤 ${username} joined room ${roomId} successfully`);
        
        // If both players are now in the room, initiate WebRTC
        if (room.users.length === 2) {
          console.log('🔗 Room now has 2 users, initiating peer connection');
          const otherUser = room.users.find(u => u.socketId !== socket.id);
          console.log('🎯 Other user:', otherUser);
          
          if (otherUser) {
            // Tell the other user to create a peer connection to this user
            console.log(`📤 Telling ${otherUser.socketId} to create peer connection to ${socket.id}`);
            io.to(otherUser.socketId).emit('create-peer-connection', {
              target: socket.id,
              initiator: true
            });
          }
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
        gameState: 'starting'
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
    
    // Validate the result (basic anti-cheat)
    if (!winner || !gameTime || gameTime < 1000 || gameTime > 300000) {
      console.log('❌ Invalid game result detected');
      return;
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
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configure CORS for Socket.IO
const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:3000"],
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
    console.log('📊 Room data:', data);
    
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

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`🔌 User disconnected: ${socket.id}`);
    
    const user = users.get(socket.id);
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

server.listen(PORT, () => {
  console.log(`🚀 Signaling server running on port ${PORT}`);
  console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🏠 Rooms status: http://localhost:${PORT}/rooms`);
});
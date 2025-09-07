# Blinking Contest Online - Product Requirements Document

## Executive Summary
- **Product Name**: Blinking Contest Online
- **Version**: 1.0
- **Date**: August 31, 2025
- **Team**: DraftOne
- **Vision**: Create the world's first real-time, multiplayer eye-tracking game that combines competitive gaming with innovative advertising, delivering entertainment value while generating revenue through sponsored distractions.

## 1. Product Overview

### 1.1 Concept
An online multiplayer game where two players compete in real-time video staring contests using advanced eye-tracking technology. Players must maintain eye contact with their camera while resisting progressively challenging distractions and advertisements.

### 1.2 Unique Value Proposition
- First-to-market real-time multiplayer eye-tracking game
- Innovative advertising model where ads become gameplay elements  
- Viral potential through competitive gaming mechanics
- Dual revenue streams from sponsors and potential premium features

## 2. Core Features & Functionality

### 2.1 MVP Features (Phase 1)

#### Real-Time Multiplayer System
- [x] **WebRTC Implementation**: Peer-to-peer video connections (PeerJS)
- [x] **Matchmaking Service**: Basic room-based player pairing
- [x] **Cross-platform Compatibility**: Works on desktop browsers
- [ ] **Low Latency Requirements**: Target <200ms for competitive fairness
- [ ] **Mobile device support**

#### Eye Tracking & Blink Detection  
- [x] **MediaPipe Integration**: Face mesh and eye landmark detection
- [x] **Eye Aspect Ratio (EAR) Algorithm**: Precise blink detection (threshold: 0.25)
- [x] **Real-time Processing**: 60fps eye tracking
- [x] **Face Centering**: Prompts user to center face for optimal detection
- [x] **Lighting Quality Detection**: Warns user of poor lighting conditions
- [ ] **Calibration System**: 5-second calibration before each match
- [ ] **Anti-cheat Measures**: Validation of genuine eye movements

#### Game Mechanics
- [x] **Progressive Difficulty**: Distractions start at 20-second mark
- [x] **Elimination Rules**: Both eyes closed for 80ms+ = loss
- [x] **Real-time Feedback**: Visual manga-style eye indicators for both players
- [x] **Score Tracking**: Time-based scoring with best score persistence
- [x] **Session Management**: Persistent user stats and game history
- [x] **Email Capture**: Conditional email modal based on performance triggers

#### Distraction System
- [x] **Scheduled Distractions**: 2 ads at 20s, then 1 every 5s (persistent)
- [x] **Random GIFs**: Appear/disappear randomly with 3-7s duration
- [x] **Distraction Types**:
  - [x] Pop-up advertisements (persistent until manually closed)
  - [x] Animated GIFs from Tenor API (temporary)
  - [x] Draggable popups with Windows 95 retro styling
  - [ ] Screen effects (particles, flashes, movement) 
  - [ ] Audio cues (if enabled)
  - [ ] Interactive elements requiring cursor movement
- [x] **Sponsor Integration**: Branded distractions with sponsor attribution
- [x] **Backend**: Local sponsor image support + web GIF integration

#### User Interface
- [x] **Clean Game View**: Opponent video, own video preview, timer
- [x] **Real-time Status**: Manga-style eye tracking indicators with animations
- [x] **Welcome Screen**: Username input, game mode selection
- [x] **Multiplayer Rooms**: Room creation and joining with codes
- [x] **Connection Status**: Real-time connection indicators
- [ ] **Match History**: Win/loss records, performance stats
- [ ] **Leaderboards**: Global and friends rankings

### 2.2 Technical Implementation Status

#### Frontend (React)
- [x] **Framework**: React 19+ with TypeScript
- [x] **State Management**: Custom hooks (useState, useEffect)
- [x] **WebRTC Library**: PeerJS for peer-to-peer connections
- [x] **Eye Tracking**: MediaPipe Face Mesh API
- [x] **UI Framework**: Tailwind CSS
- [x] **Build Tool**: Vite
- [ ] **Real-time Updates**: Socket.io or WebSockets for matchmaking

#### Backend Architecture (Planned)
- [ ] **Runtime**: Node.js with Express or Fastify
- [ ] **Database**: PostgreSQL for user data, Redis for sessions  
- [ ] **Authentication**: JWT tokens with refresh mechanism
- [ ] **Matchmaking**: Queue system with skill-based matching
- [ ] **Analytics**: Custom event tracking + Google Analytics 4

#### Infrastructure (Planned)
- [ ] **Hosting**: AWS or Google Cloud Platform
- [ ] **CDN**: CloudFront for global low-latency asset delivery
- [ ] **Monitoring**: Sentry for error tracking, DataDog for performance
- [ ] **Scaling**: Auto-scaling groups, load balancers
- [ ] **Security**: Rate limiting, DDoS protection, input validation

## 3. Current Game Mechanics (Implemented)

### Single Player Mode
- Camera access and face detection setup
- 20 seconds of gameplay before first distractions
- Progressive ad accumulation (2 at 20s, +1 every 5s)
- Random GIFs that appear and disappear
- Score tracking with best score persistence

### Multiplayer Mode  
- Room-based matchmaking with room codes
- Real-time video streaming between players
- Synchronized blink detection and elimination
- Ready/countdown system
- Connection status monitoring

### Distraction System
- **Persistent Ads**: Sponsored content that accumulates on screen
- **Temporary GIFs**: Random animated content with auto-removal
- **Interactive Popups**: Draggable Windows 95 style windows
- **5-second Close Delay**: Prevents immediate popup dismissal
- **Smart Positioning**: Random placement avoiding center video area

## 4. Development Status

### ✅ Completed Features
- Eye tracking and blink detection
- Real-time multiplayer with WebRTC
- Distraction overlay system with separate GIF/Ad components
- Windows 95 retro popup styling with drag functionality
- Session management and email capture
- Room-based multiplayer system
- Responsive UI with mobile considerations
- Git repository with passwordless authentication

### 🚧 In Progress
- Performance optimization
- Enhanced mobile support
- Additional distraction types

### 📋 Next Phase Features
- Backend infrastructure
- User accounts and authentication  
- Proper matchmaking service
- Leaderboards and statistics
- Enhanced anti-cheat measures
- Audio distraction support
- Tournament mode
- Monetization integration

## 5. Revenue Model (Planned)
- **Primary**: Sponsored distraction content
- **Secondary**: Premium features (ad-free practice mode, custom themes)
- **Future**: Tournament entry fees, merchandise

---

*Last Updated: January 2025*
*Current Version: MVP Development Phase*
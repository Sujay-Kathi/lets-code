# 📕 Full Context & System Design

## Architecture
Frontend (Vercel)
↓
Backend API
↓
Queue System
↓
Execution Engine (Docker)

## Execution Flow
1. Student submits code
2. Backend queues request
3. Worker executes code
4. Output returned

## Code Execution

### Python
python3 file.py

### C
gcc file.c -o output
./output

## Safety
- Time limit: 2 sec
- Memory limits
- No network access

## Anti-Cheat
- Fullscreen enforcement
- Tab detection
- Resume system
- Attempt limits

## Limitations
- Cannot prevent second device cheating
- Cannot fully block split screen

## Data Models

User:
- id
- name
- role

Quiz:
- id
- title

Question:
- id
- description

Submission:
- id
- code
- result

## Realtime
- WebSockets for updates

## Constraints
- No compiler on Vercel
- Needs backend server

## Future Enhancements
- More languages
- Analytics
- Plagiarism detection


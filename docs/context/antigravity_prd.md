# 📘 Product Requirements Document (PRD)

## Product Name
Antigravity — Live Coding Quiz Platform

## Vision
To create a real-time coding quiz platform with strong control, fairness, and live monitoring for classrooms.

## Target Users
- Students
- Teachers
- Bootcamps

## Core Features

### Teacher
- Create quiz before start
- Add/edit coding questions
- Set time limits
- Start/stop quiz
- Freeze students (time up)
- Monitor submissions, attempts, tab switches
- Reveal leaderboard

### Student
- Fullscreen required
- Code editor (Python, C)
- Max 4 attempts
- Instant feedback
- Continue quiz after tab switch

## Scoring System
Score = Base + Speed Bonus - Attempt Penalty - Tab Switch Penalty

## Constraints
- Cannot run compiler on Vercel
- Requires backend server

## Success Metrics
- <2 sec response time
- Handle 50+ users (MVP)


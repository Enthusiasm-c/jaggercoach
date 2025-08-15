# Jägermeister BA Training Simulator

**Version:** 2.0.0  
**Last Updated:** August 15, 2025  

## Overview

An AI-powered training simulator for Jägermeister Brand Ambassadors to practice selling High 5 standards to skeptical bar owners. Built with Next.js 15.3 and OpenAI GPT models.

## Features

- **Realistic Scenarios**: Practice with 3 core scenarios
  - Product Not Present (convince to stock Jägermeister)
  - No Promo (product present but not promoted)
  - No Perfect Serve (not served at -18°C)

- **Dynamic AI Conversations**: 
  - AI plays different bar owner personas
  - Realistic objections based on difficulty level
  - Adaptive responses to BA's sales approach

- **Performance Tracking**:
  - Real-time objective tracking
  - High 5 element coverage monitoring
  - On-demand coaching hints

- **Difficulty Levels**:
  - Easy: Open-minded owners, quick agreement
  - Medium: Balanced negotiation needed
  - Hard: Skeptical owners requiring data and guarantees

## Tech Stack

- **Frontend**: Next.js 15.3.0, React 19 RC, TypeScript
- **AI Models**: OpenAI GPT-5-mini (agent), GPT-4o-mini (hints)
- **Styling**: Tailwind CSS with Jägermeister branding
- **Deployment**: Vercel
- **State Management**: React hooks, Server-Sent Events for streaming

## Performance Optimizations (v2.0.0)

- Response time improved from 20-50s to 6-17s
- Removed judge from critical path
- On-demand hint generation
- Lightweight progress tracking

## Getting Started

### Prerequisites

- Node.js 18+ 
- pnpm 9.12.3
- OpenAI API key

### Environment Variables

Create a `.env.local` file:

```env
OPENAI_API_KEY=your_openai_api_key_here
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

### Installation

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to start training.

## Usage

1. Click "Configure Training" on the intro screen
2. Select a scenario (or choose random)
3. Choose difficulty level
4. Start training and greet the bar owner with "Hello"
5. Use the hint button when stuck
6. Complete objectives to finish the scenario

## Project Structure

```
/app
  /(chat)
    /api/chat     # Main chat endpoint
    /page.tsx     # Training interface
  /api
    /agent        # Bar owner AI responses
    /hint         # Coaching hints (on-demand)
    /judge        # Performance evaluation (optional)
/lib
  /trainer-state.ts  # Training state management
/scenarios
  /jaeger_high5.yaml # Scenario definitions
```

## Recent Updates (August 2025)

- **v2.0.0**: Major performance optimization
  - 3x faster response times
  - On-demand hint generation
  - Improved conversation ending detection
  - Fixed venue-specific consistency issues
  - Claude-style dark UI with Jägermeister branding

## Deployment

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Enthusiasm-c/jaggercoach)

## License

MIT

## Support

For issues or questions, please open an issue on [GitHub](https://github.com/Enthusiasm-c/jaggercoach/issues).

---

Built with ❤️ for Jägermeister Brand Ambassadors  
© 2025 JägerCoach Training Simulator
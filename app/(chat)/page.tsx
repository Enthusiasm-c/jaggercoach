'use client';

import { useState, useRef, useEffect } from 'react';
import { generateUUID } from '@/lib/utils';

type Difficulty = 'easy' | 'medium' | 'hard';
type View = 'intro' | 'settings' | 'chat' | 'summary';

interface TrainingState {
  scenarioId: string;
  turn: number;
  objectionsRaised: string[];
  coveredHigh5: string[];
  objectives: {
    trialOrder?: boolean;
    promoAgreed?: boolean;
    staffTraining?: boolean;
    tapMachine?: boolean;
  };
  done: boolean;
  lastExchange?: {
    baMessage: string;
    ownerResponse: string;
  };
}

export default function SimpleChatPage() {
  const [view, setView] = useState<View>('intro');
  const [messages, setMessages] = useState<Array<{ role: string; content: string; isHint?: boolean }>>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatId, setChatId] = useState(generateUUID());
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [scenarioType, setScenarioType] = useState<string>('random');
  const [currentScenario, setCurrentScenario] = useState<any>(null);
  const [finalScore, setFinalScore] = useState<any>(null);
  const [trainingState, setTrainingState] = useState<TrainingState | null>(null);
  const [latestHint, setLatestHint] = useState<string>('');
  const [showGoals, setShowGoals] = useState(false);
  const [showHintRequest, setShowHintRequest] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const startTraining = () => {
    setView('chat');
    setChatId(generateUUID());
    setMessages([]);
    setInput('Hello');
    setLatestHint('');
    setTrainingState(null);
    // Auto-send greeting after transition
    setTimeout(() => {
      const form = document.querySelector('form');
      if (form) {
        form.dispatchEvent(new Event('submit', { bubbles: true }));
      }
    }, 100);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);
    
    // Reset hint for new turn
    setLatestHint('');
    setShowHintRequest(false);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: chatId,
          message: {
            role: 'user',
            parts: [{ type: 'text', text: userMessage }]
          },
          difficulty,
          trainingState,
          scenarioType
        })
      });

      if (!response.ok) throw new Error('Failed to send message');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';
      let isFirstMessage = userMessage.toLowerCase() === 'hello';

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              
              if (parsed.type === 'data-appendMessage') {
                const messageData = JSON.parse(parsed.data);
                const content = messageData.parts[0].text;
                
                // Parse scenario info from first message
                if (isFirstMessage && content.includes('Scenario:')) {
                  const scenarioMatch = content.match(/Scenario: "([^"]+)"/);
                  const barNameMatch = content.match(/"([^"]+)" — /);
                  const personaMatch = content.match(/— (\w+) —/);
                  if (scenarioMatch) {
                    setCurrentScenario({
                      title: scenarioMatch[1],
                      barName: barNameMatch ? barNameMatch[1] : 'The Bar',
                      persona: personaMatch ? personaMatch[1] : 'Bar Owner'
                    });
                    
                    // Set initial hint based on scenario
                    if (scenarioMatch[1].includes('Product Not Present')) {
                      setLatestHint('Start by acknowledging their concern, then ask about their current shot selection and customer preferences. Show genuine interest in their business.');
                    } else if (scenarioMatch[1].includes('No Promo')) {
                      setLatestHint('Acknowledge their style concerns. Ask about their current promotion methods and what has worked well for them in the past.');
                    } else if (scenarioMatch[1].includes('No Perfect Serve')) {
                      setLatestHint('Start by asking about their current serve temperature and if they\'ve noticed any customer feedback. Mention the taste difference at -18°C.');
                    }
                  }
                }
                
                // Check if this is a system message (training complete)
                if (messageData.role === 'system') {
                  // Parse final score
                  const scoreMatch = content.match(/Overall Score: (\d+)%/);
                  if (scoreMatch) {
                    setFinalScore({
                      percentage: parseInt(scoreMatch[1]),
                      message: content
                    });
                    setView('summary');
                  }
                } else {
                  assistantMessage = content;
                  
                  setMessages(prev => {
                    const newMessages = [...prev];
                    const lastMessage = newMessages[newMessages.length - 1];
                    
                    if (lastMessage && lastMessage.role === 'assistant') {
                      lastMessage.content = assistantMessage;
                    } else {
                      newMessages.push({ 
                        role: 'assistant', 
                        content: assistantMessage
                      });
                    }
                    return newMessages;
                  });
                }
              } else if (parsed.type === 'data-custom' && parsed.data) {
                // Handle training state updates
                const customData = parsed.data;
                if (customData.type === 'trainingState' && customData.data) {
                  setTrainingState(customData.data);
                }
              }
            } catch (e) {
              // Ignore parsing errors
            }
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, { 
        role: 'error', 
        content: 'Failed to send message. Please try again.' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e as any);
    }
  };

  const resetTraining = () => {
    setView('intro');
    setMessages([]);
    setCurrentScenario(null);
    setFinalScore(null);
    setTrainingState(null);
    setLatestHint('');
    setChatId(generateUUID());
  };

  return (
    <>
      <style jsx global>{`
        :root {
          --brand-orange: #E65C00;
          --brand-green: #0B3B2E;
          --bg: #FFF7EB;
          --ink: #0B3B2E;
          --muted: #6B7D76;
          --card: #FFFFFF;
          --brd: #E9E2DA;
          --accent: var(--brand-orange);
          --ok: #10b981;
          --danger: #b91c1c;
        }
        * { box-sizing: border-box; }
        html, body { 
          height: 100%; 
          /* Force light mode colors */
          background: #FFF7EB !important;
          color: #0B3B2E !important;
        }
        body { 
          margin: 0; 
          font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; 
          background: var(--bg) !important; 
          color: var(--ink) !important; 
        }
        /* Override dark mode */
        @media (prefers-color-scheme: dark) {
          :root {
            --bg: #FFF7EB;
            --ink: #0B3B2E;
            --card: #FFFFFF;
          }
          body {
            background: #FFF7EB !important;
            color: #0B3B2E !important;
          }
        }
      `}</style>

      {view === 'intro' && (
        <>
          <div className="brand-hero">
            <div className="intro-wrap">
              <div className="intro-title">Jägermeister BA Trainer</div>
              <div className="intro-sub">
                Practice selling Jägermeister High 5 standards to skeptical bar owners.
                The AI will play different personas and raise realistic objections.
              </div>
              
              <div className="mini">
                <li><span style={{color: '#86efac'}}>✓</span> Real scenarios (no product, no promo, no perfect serve)</li>
                <li><span style={{color: '#86efac'}}>✓</span> Dynamic objections based on difficulty</li>
                <li><span style={{color: '#86efac'}}>✓</span> Live coaching hints during conversation</li>
                <li><span style={{color: '#86efac'}}>✓</span> Performance scoring and feedback</li>
              </div>

              <div className="intro-cta">
                <button onClick={() => setView('settings')} className="btn hero-btn">
                  Configure Training →
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {view === 'settings' && (
        <div className="container">
          <header>
            <div className="row">
              <div className="logo">J5</div>
              <div>
                <h1>Training Configuration</h1>
                <p className="muted">Select your training parameters</p>
              </div>
            </div>
          </header>

          <main>
            <div className="card pad">
              <h2>Training Goal (Scenario)</h2>
              <p className="muted">
                Choose a specific scenario or let the system randomly select one.
              </p>
              
              <div className="grid grid-2" style={{ marginTop: '16px' }}>
                <button 
                  className={`scenario-card ${scenarioType === 'random' ? 'active' : ''}`}
                  onClick={() => setScenarioType('random')}
                >
                  <div className="scenario-label">RANDOM</div>
                  <div className="scenario-desc">System selects a random scenario</div>
                </button>
                <button 
                  className={`scenario-card ${scenarioType === 'product_absent' ? 'active' : ''}`}
                  onClick={() => setScenarioType('product_absent')}
                >
                  <div className="scenario-label">NO PRODUCT</div>
                  <div className="scenario-desc">Bar doesn&apos;t carry Jägermeister</div>
                </button>
                <button 
                  className={`scenario-card ${scenarioType === 'no_promo' ? 'active' : ''}`}
                  onClick={() => setScenarioType('no_promo')}
                >
                  <div className="scenario-label">NO PROMO</div>
                  <div className="scenario-desc">Product present but not promoted</div>
                </button>
                <button 
                  className={`scenario-card ${scenarioType === 'no_perfect_serve' ? 'active' : ''}`}
                  onClick={() => setScenarioType('no_perfect_serve')}
                >
                  <div className="scenario-label">NO PERFECT SERVE</div>
                  <div className="scenario-desc">Not served at -18°C</div>
                </button>
              </div>
            </div>

            <div className="card pad" style={{ marginTop: '12px' }}>
              <h2>Difficulty Level</h2>
              <p className="muted">
                This affects how quickly the bar owner agrees and how many objections they raise.
              </p>
              
              <div className="grid grid-3" style={{ marginTop: '16px' }}>
                <button 
                  className={`diff-card ${difficulty === 'easy' ? 'active' : ''}`}
                  onClick={() => setDifficulty('easy')}
                >
                  <div className="diff-label">EASY</div>
                  <div className="diff-desc">Owner is open-minded, agrees after 1-2 good arguments</div>
                </button>
                <button 
                  className={`diff-card ${difficulty === 'medium' ? 'active' : ''}`}
                  onClick={() => setDifficulty('medium')}
                >
                  <div className="diff-label">MEDIUM</div>
                  <div className="diff-desc">Balanced negotiation, needs 2-3 solid points</div>
                </button>
                <button 
                  className={`diff-card ${difficulty === 'hard' ? 'active' : ''}`}
                  onClick={() => setDifficulty('hard')}
                >
                  <div className="diff-label">HARD</div>
                  <div className="diff-desc">Skeptical owner, requires data and guarantees</div>
                </button>
              </div>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button onClick={() => setView('intro')} className="btn ghost">
                ← Back
              </button>
              <button onClick={startTraining} className="btn primary">
                Start Training
              </button>
            </div>
          </main>
        </div>
      )}

      {view === 'chat' && (
        <>
          <header>
            <div className="container">
              <div className="row" style={{ padding: '12px 0' }}>
                <div className="logo">J5</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '18px', fontWeight: '600' }}>
                    {currentScenario ? currentScenario.title : 'Training Session'}
                  </div>
                  {currentScenario && (
                    <div className="muted" style={{ fontSize: '14px' }}>
                      {currentScenario.barName} • {currentScenario.persona} • Turn {trainingState?.turn || 0}
                    </div>
                  )}
                </div>
                <button 
                  onClick={() => setShowGoals(!showGoals)} 
                  className="btn ghost"
                  style={{ position: 'relative' }}
                >
                  Goals
                  {showGoals && (
                    <div className="goals-popup">
                      <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Session Goals</div>
                      <div className="goal-list">
                        <div className={trainingState?.objectives?.trialOrder ? 'goal done' : 'goal'}>
                          {trainingState?.objectives?.trialOrder ? '✓' : '○'} Trial order agreed
                        </div>
                        <div className={trainingState?.objectives?.promoAgreed ? 'goal done' : 'goal'}>
                          {trainingState?.objectives?.promoAgreed ? '✓' : '○'} Promo agreed
                        </div>
                        <div className={trainingState?.objectives?.staffTraining ? 'goal done' : 'goal'}>
                          {trainingState?.objectives?.staffTraining ? '✓' : '○'} Staff training scheduled
                        </div>
                        <div className={trainingState?.objectives?.tapMachine ? 'goal done' : 'goal'}>
                          {trainingState?.objectives?.tapMachine ? '✓' : '○'} Tap/freezer agreed
                        </div>
                      </div>
                      <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--brd)' }}>
                        <div style={{ fontSize: '12px', color: 'var(--muted)' }}>High 5 Coverage</div>
                        <div className="high5-tags">
                          {trainingState?.coveredHigh5?.map((h5, i) => (
                            <span key={i} className="tag small">{h5}</span>
                          )) || <span className="muted">None yet</span>}
                        </div>
                      </div>
                    </div>
                  )}
                </button>
                <button onClick={resetTraining} className="btn ghost">
                  End
                </button>
              </div>
            </div>
          </header>

          <main className="container">
            <div className="chatWrap">
              {messages.map((message, index) => (
                <div key={index} style={{ marginBottom: '12px' }}>
                  {message.role === 'user' && (
                    <>
                      <div className="who">BA</div>
                      <div className="bubble ba">{message.content}</div>
                    </>
                  )}
                  {message.role === 'assistant' && (
                    <>
                      <div className="who">{currentScenario?.persona || 'CLIENT'}</div>
                      <div 
                        className="bubble cl"
                        dangerouslySetInnerHTML={{ 
                          __html: message.content
                            .replace(/⸻/g, '<hr style="margin: 12px 0; border: none; border-top: 1px solid var(--brd);">')
                            .replace(/🟢 Situation:/g, '<strong style="color: var(--ok);">Situation:</strong>')
                            .replace(/🎯/g, '<strong>Goal:</strong>')
                            .replace(/👉/g, '→')
                            .replace(/\n/g, '<br>')
                        }}
                      />
                    </>
                  )}
                </div>
              ))}
              {isLoading && (
                <div>
                  <div className="who">{currentScenario?.persona || 'CLIENT'}</div>
                  <div className="bubble cl">
                    <span className="typing">...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {showHintRequest && latestHint && (
              <div className="hint-popup">
                <div className="hint-popup-header">
                  <span>COACHING TIP</span>
                  <button onClick={() => setShowHintRequest(false)} className="close-btn">×</button>
                </div>
                <div className="hint-popup-content">{latestHint}</div>
              </div>
            )}
            
            <form onSubmit={sendMessage} className="bar">
              <button 
                type="button"
                onClick={async () => {
                  // If we already have a hint, just toggle display
                  if (latestHint && !isLoading) {
                    setShowHintRequest(!showHintRequest);
                    return;
                  }
                  
                  // Generate new hint on demand
                  if (trainingState?.lastExchange && !isLoading) {
                    try {
                      const response = await fetch('/api/hint', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          scenarioId: trainingState.scenarioId,
                          lastBA: trainingState.lastExchange.baMessage,
                          lastOwner: trainingState.lastExchange.ownerResponse,
                          state: trainingState
                        })
                      });
                      
                      const data = await response.json();
                      if (data.hint) {
                        setLatestHint(data.hint);
                        setShowHintRequest(true);
                      }
                    } catch (error) {
                      console.error('Failed to get hint:', error);
                    }
                  }
                }}
                className="btn hint-btn"
                disabled={isLoading || (!latestHint && !trainingState?.lastExchange)}
                title={trainingState?.lastExchange ? "Get hint" : "No conversation yet"}
              >
                Hint
              </button>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Your response..."
                disabled={isLoading}
              />
              <button 
                type="submit" 
                className="btn primary" 
                disabled={isLoading || !input.trim()}
              >
                Send
              </button>
            </form>
          </main>
        </>
      )}

      {view === 'summary' && (
        <div className="container" style={{ paddingTop: '48px' }}>
          <div className="summary">
            <div className="block" style={{ textAlign: 'center' }}>
              <div className="score">{finalScore?.percentage}%</div>
              <h2>Training Complete!</h2>
              <p className="muted">Great job completing the scenario</p>
            </div>
            
            <div className="block">
              <div 
                dangerouslySetInnerHTML={{ 
                  __html: finalScore?.message
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/⸻/g, '<hr style="margin: 16px 0; border: none; border-top: 1px solid var(--brd);">')
                    .replace(/🎉/g, '<span style="font-size: 24px;">Congratulations!</span><br>')
                    .replace(/✅/g, '✓')
                    .replace(/•/g, '<span style="color: var(--brand-orange);">•</span>')
                    .replace(/\n/g, '<br>')
                }}
              />
            </div>

            <button onClick={resetTraining} className="btn primary" style={{ width: '100%' }}>
              Try Another Scenario
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .brand-hero {
          min-height: 100vh;
          width: 100vw;
          background: var(--brand-green);
          color: #fff;
          display: grid;
          place-items: center;
          text-align: center;
          padding: 24px;
        }
        .intro-wrap {
          max-width: 760px;
          display: grid;
          gap: 24px;
        }
        .intro-title {
          font-size: 40px;
          font-weight: 800;
          letter-spacing: 0.3px;
        }
        .intro-sub {
          color: #d5e1dc;
          line-height: 1.55;
          font-size: 18px;
        }
        .mini {
          list-style: none;
          padding: 0;
          margin: 10px 0 0;
          display: grid;
          gap: 8px;
          text-align: left;
          max-width: 500px;
          margin: 0 auto;
        }
        .mini li {
          display: flex;
          gap: 12px;
          align-items: baseline;
          font-size: 15px;
          color: #d5e1dc;
        }
        .intro-cta {
          margin-top: 12px;
        }
        .btn.hero-btn {
          background: var(--brand-orange);
          border: 2px solid var(--brand-orange);
          color: #fff;
          padding: 14px 28px;
          font-size: 16px;
          font-weight: 600;
        }
        .btn.hero-btn:hover {
          background: #D55200;
          border-color: #D55200;
          transform: translateY(-1px);
        }
        .container {
          max-width: 1000px;
          margin: 0 auto;
          padding: 20px;
        }
        header {
          padding: 20px 0;
          border-bottom: 1px solid var(--brd);
        }
        main {
          padding: 20px 0;
        }
        .grid {
          display: grid;
          gap: 12px;
        }
        .grid-2 {
          grid-template-columns: repeat(2, 1fr);
        }
        .grid-3 {
          grid-template-columns: repeat(3, 1fr);
        }
        @media (max-width: 720px) {
          .grid-2 {
            grid-template-columns: 1fr;
          }
          .grid-3 {
            grid-template-columns: 1fr;
          }
          .intro-title {
            font-size: 32px;
          }
          .intro-sub {
            font-size: 16px;
          }
        }
        .diff-card {
          background: #fff;
          border: 2px solid var(--brd);
          border-radius: 12px;
          padding: 16px;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s;
        }
        .diff-card:hover {
          border-color: var(--accent);
          transform: translateY(-1px);
        }
        .diff-card.active {
          border-color: var(--accent);
          background: #FFF7EB;
        }
        .diff-label {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.5px;
          color: var(--accent);
          margin-bottom: 6px;
        }
        .diff-desc {
          font-size: 13px;
          color: var(--muted);
          line-height: 1.4;
        }
        .scenario-card {
          background: #fff;
          border: 2px solid var(--brd);
          border-radius: 12px;
          padding: 16px;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s;
        }
        .scenario-card:hover {
          border-color: var(--accent);
          transform: translateY(-1px);
        }
        .scenario-card.active {
          border-color: var(--accent);
          background: #FFF7EB;
        }
        .scenario-label {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.5px;
          color: var(--brand-green);
          margin-bottom: 6px;
        }
        .scenario-desc {
          font-size: 13px;
          color: var(--muted);
          line-height: 1.4;
        }
        .btn.hint-btn {
          background: #E8F4FD;
          border-color: #B4D4F1;
          color: #0b57d0;
        }
        .btn.hint-btn:hover:not(:disabled) {
          background: #D2E8FC;
        }
        .btn.hint-btn:disabled {
          opacity: 0.3;
        }
        .hint-popup {
          position: fixed;
          bottom: 80px;
          left: 20px;
          right: 20px;
          max-width: 600px;
          margin: 0 auto;
          background: white;
          border: 1px solid var(--brd);
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 1000;
        }
        .hint-popup-header {
          padding: 12px 16px;
          border-bottom: 1px solid var(--brd);
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
          font-weight: 600;
          color: #0b57d0;
          letter-spacing: 0.5px;
        }
        .hint-popup-content {
          padding: 16px;
          font-size: 14px;
          line-height: 1.5;
          color: var(--ink);
        }
        .close-btn {
          background: none;
          border: none;
          font-size: 20px;
          color: var(--muted);
          cursor: pointer;
          padding: 0;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .close-btn:hover {
          color: var(--ink);
        }
        .row {
          display: flex;
          gap: 12px;
          align-items: center;
        }
        .logo {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: var(--brand-green);
          color: #fff;
          display: grid;
          place-items: center;
          font-weight: 800;
          font-size: 18px;
        }
        h1 {
          margin: 0;
          font-size: 24px;
          color: var(--ink);
        }
        h2 {
          margin: 0 0 12px 0;
          font-size: 20px;
        }
        p {
          margin: 8px 0;
          line-height: 1.5;
        }
        .muted {
          color: var(--muted);
        }
        .card {
          background: var(--card);
          border: 1px solid var(--brd);
          border-radius: 16px;
        }
        .pad {
          padding: 20px;
        }
        label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: var(--muted);
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .select {
          appearance: none;
          border: 1px solid var(--brd);
          background: #fff;
          border-radius: 12px;
          padding: 12px 42px 12px 14px;
          font-size: 14px;
          width: 100%;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='%230B3B2E' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");
          background-repeat: no-repeat;
          background-position: right 12px center;
          background-size: 18px;
        }
        .select:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(230, 92, 0, 0.15);
        }
        .btn {
          border: 1px solid var(--brd);
          background: #fff;
          border-radius: 999px;
          padding: 10px 20px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: 0.2s;
        }
        .btn.primary {
          background: var(--accent);
          color: #fff;
          border-color: var(--accent);
        }
        .btn.ghost {
          background: #fff;
        }
        .btn:hover {
          transform: translateY(-1px);
        }
        .btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .goals-popup {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 8px;
          background: white;
          border: 1px solid var(--brd);
          border-radius: 12px;
          padding: 16px;
          min-width: 280px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          z-index: 10;
        }
        .goal-list {
          display: grid;
          gap: 6px;
          margin-top: 8px;
        }
        .goal {
          font-size: 14px;
          color: var(--muted);
        }
        .goal.done {
          color: var(--ok);
          font-weight: 500;
        }
        .high5-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 6px;
        }
        .tag {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 999px;
          border: 1px solid var(--brd);
          background: #fff;
          font-size: 11px;
        }
        .tag.small {
          padding: 3px 8px;
          font-size: 11px;
        }
        .chatWrap {
          height: calc(100vh - 280px);
          overflow-y: auto;
          padding: 12px 0;
        }
        .bubble {
          max-width: 78%;
          border-radius: 14px;
          padding: 12px 16px;
          font-size: 14px;
          line-height: 1.5;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
        }
        .ba {
          margin-left: auto;
          background: var(--brand-green);
          color: #fff;
          border-bottom-right-radius: 4px;
        }
        .cl {
          margin-right: auto;
          background: #fff;
          border: 1px solid var(--brd);
          color: var(--ink);
          border-bottom-left-radius: 4px;
        }
        .who {
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          opacity: 0.6;
          margin-bottom: 6px;
        }
        .bar {
          display: flex;
          align-items: center;
          gap: 8px;
          position: sticky;
          bottom: 0;
          background: var(--bg);
          padding: 12px 0;
          border-top: 1px solid var(--brd);
        }
        .bar input {
          flex: 1;
          border: 1px solid var(--brd);
          border-radius: 12px;
          padding: 12px 14px;
          font-size: 16px;
        }
        .bar input:focus {
          outline: none;
          border-color: var(--accent);
        }
        @media (max-width: 480px) {
          .container {
            padding: 12px;
          }
          .bar {
            padding: 8px 0;
          }
          .btn {
            padding: 10px 14px;
            font-size: 13px;
          }
          .goals-popup {
            position: fixed !important;
            left: 12px !important;
            right: 12px !important;
            top: auto !important;
            bottom: 80px !important;
          }
          .hint-popup {
            left: 12px;
            right: 12px;
          }
          .chatWrap {
            height: calc(100vh - 240px);
          }
        }
        .typing {
          animation: pulse 1.5s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        .summary {
          display: grid;
          gap: 16px;
        }
        .score {
          font-size: 56px;
          font-weight: 900;
          color: var(--brand-green);
        }
        .block {
          background: #fff;
          border: 1px solid var(--brd);
          border-radius: 16px;
          padding: 24px;
        }
      `}</style>
    </>
  );
}
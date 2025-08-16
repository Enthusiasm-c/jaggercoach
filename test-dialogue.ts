// Test script for dialogue system
import { getAgentResponse } from './lib/agent';
import { createInitialState, TrainerState } from './lib/trainer-state';

// Test scenarios
const scenarios = {
  'product_absent': {
    id: 'product_absent',
    title: 'Product Not Present',
    persona: 'Sarah',
    bar_name: 'The Velvet Room',
    description: 'Minimalist cocktail bar owner, skeptical about new products',
    primary_objection: "We don't carry Jägermeister, focus on signature shots",
    secondary_objection_pool: ['space constraints', 'brand fit', 'customer preference'],
    must_cover_high5: ['Ice Cold Serve', 'Visibility']
  },
  'no_perfect_serve': {
    id: 'no_perfect_serve', 
    title: 'No Perfect Serve',
    persona: 'Mark',
    bar_name: 'Wave House',
    description: 'Beach club manager, has tap machine but not using it',
    primary_objection: "Tap machine is off, bottles sell fine from shelf",
    secondary_objection_pool: ['electricity costs', 'maintenance', 'staff training'],
    must_cover_high5: ['Ice Cold Serve', 'Staff']
  }
};

async function testDialogue(scenarioId: keyof typeof scenarios, difficulty: string, userMessages: string[]) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${scenarios[scenarioId].title} (${difficulty} mode)`);
  console.log(`${'='.repeat(60)}\n`);

  let state = createInitialState(scenarioId as any, scenarios[scenarioId].must_cover_high5);
  state.turn = 1; // Start after greeting
  
  for (const userMessage of userMessages) {
    console.log(`BA: ${userMessage}`);
    
    try {
      const response = await getAgentResponse(
        scenarioId,
        state,
        userMessage,
        difficulty,
        []
      );
      
      console.log(`${scenarios[scenarioId].persona.toUpperCase()}: ${response.reply}\n`);
      
      // Count sentences in response
      const sentences = response.reply.match(/[.!?]+/g)?.length || 0;
      if (sentences > 4) {
        console.log(`⚠️  WARNING: Response too long (${sentences} sentences)\n`);
      }
      
      // Update state
      state.turn++;
      
      // Check for agreement
      const replyLower = response.reply.toLowerCase();
      if (replyLower.includes("i'm in") || replyLower.includes("let's try") || 
          replyLower.includes("deal") || replyLower.includes("book it")) {
        console.log(`✅ AGREEMENT REACHED at turn ${state.turn}\n`);
        if (scenarioId === 'no_perfect_serve') {
          state.objectives.tapMachine = true;
        } else if (scenarioId === 'product_absent') {
          state.objectives.trialOrder = true;
        }
        break;
      }
      
      // Prevent infinite loops
      if (state.turn > 12) {
        console.log(`⚠️  WARNING: Conversation too long (${state.turn} turns)\n`);
        break;
      }
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      break;
    }
  }
  
  return state;
}

async function runTests() {
  console.log('Starting Dialogue System Tests...\n');
  
  // Test 1: Basic greeting response (should be short)
  console.log('\n📝 TEST 1: Response Length Check');
  await testDialogue('product_absent', 'medium', [
    "Tell me about your customers"
  ]);
  
  // Test 2: Conversation progression without loops
  console.log('\n📝 TEST 2: No Repetition Check');
  await testDialogue('product_absent', 'medium', [
    "We offer everything for free",
    "Yes, completely free including training",
    "We'll take it back if it doesn't work",
    "No minimum commitment"
  ]);
  
  // Test 3: Easy mode - should agree quickly
  console.log('\n📝 TEST 3: Easy Mode - Quick Agreement');
  await testDialogue('no_perfect_serve', 'easy', [
    "The tap machine will increase your sales by 50%",
    "We provide everything for free and handle maintenance"
  ]);
  
  // Test 4: Hard mode - should be more skeptical
  console.log('\n📝 TEST 4: Hard Mode - Skeptical Response');
  await testDialogue('no_perfect_serve', 'hard', [
    "It will increase sales",
    "We have data showing 50% increase",
    "Everything is free",
    "We handle all maintenance and training"
  ]);
  
  // Test 5: Proper ending after confirmation
  console.log('\n📝 TEST 5: Conversation Ending');
  await testDialogue('product_absent', 'medium', [
    "We offer free trial with no commitment",
    "Custom cocktail recipes for your venue",
    "Minimal POSM that fits your aesthetic",
    "Deal?"
  ]);
  
  console.log('\n' + '='.repeat(60));
  console.log('Tests Complete!');
  console.log('='.repeat(60));
}

// Run tests
runTests().catch(console.error);
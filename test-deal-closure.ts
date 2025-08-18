// Test that agents close deals properly when conditions are met
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env.local') });

import { getAgentResponse } from './lib/agent';
import { createInitialState } from './lib/trainer-state';

async function testDealClosure() {
  console.log('\n🧪 TESTING DEAL CLOSURE - Agents Should Close When Conditions Met\n');
  console.log('=' .repeat(60));
  
  // Test Tom scenario with no POSM agreement
  console.log('\nSCENARIO: Tom (No Promo) - Testing Deal Closure');
  console.log('-'.repeat(40));
  
  const scenario = {
    id: 'no_promo',
    title: 'Product Present, No Promo',
    persona: 'bar manager of a popular pub (120 seats), shot traffic exists',
    primary_objection: "POSM ruins the style, we don't need it.",
    secondary_objection_pool: ['Promos distract guests/cause chaos', 'Service speed suffers']
  };
  
  const state = createInitialState('no_promo', ['Visibility', 'Promo']);
  const conversationHistory: string[] = [];
  
  // Turn 1: Discovery
  state.turn = 1;
  console.log('\nTurn 1:');
  console.log('BA: Tom, what promos do you run now?');
  const response1 = await getAgentResponse('no_promo', state, 
    "Tom, what promos do you run now?", 'medium', conversationHistory);
  console.log(`TOM: ${response1.reply}`);
  conversationHistory.push('promos_described');
  
  // Turn 2: BA offers no POSM
  state.turn = 2;
  console.log('\nTurn 2:');
  console.log('BA: We can do promo hours with free product, no posters, no POSM');
  const response2 = await getAgentResponse('no_promo', state,
    "We can do promo hours with free product, no posters, no POSM", 'medium', conversationHistory);
  console.log(`TOM: ${response2.reply}`);
  conversationHistory.push('no_posm'); // BA agreed to no POSM
  
  // Turn 3: BA tries to close
  state.turn = 3;
  console.log('\nTurn 3:');
  console.log('BA: So deal?');
  const response3 = await getAgentResponse('no_promo', state,
    "So deal?", 'medium', conversationHistory);
  console.log(`TOM: ${response3.reply}`);
  
  // Check if Tom closes or keeps asking
  const tomCloses3 = response3.reply.toLowerCase().includes('deal') ||
                     response3.reply.toLowerCase().includes('let\'s') ||
                     response3.reply.toLowerCase().includes('great') ||
                     response3.reply.toLowerCase().includes('yes');
  console.log(`\n✓ Tom closes after main concern addressed: ${tomCloses3 ? '✅ PASS' : '⚠️ Still hesitant'}`);
  
  // Turn 4: BA confirms everything
  state.turn = 4;
  console.log('\nTurn 4:');
  console.log('BA: Yes, no POSM, free product, training included');
  conversationHistory.push('training_agreed');
  conversationHistory.push('ba_confirmed');
  const response4 = await getAgentResponse('no_promo', state,
    "Yes, no POSM, free product, training included", 'medium', conversationHistory);
  console.log(`TOM: ${response4.reply}`);
  
  // Tom MUST close by now
  const tomCloses4 = response4.reply.toLowerCase().includes('deal') ||
                     response4.reply.toLowerCase().includes('let\'s do it') ||
                     response4.reply.toLowerCase().includes('great') ||
                     response4.reply.toLowerCase().includes('start') ||
                     response4.reply.toLowerCase().includes('sounds good');
  console.log(`\n✓ Tom closes after full confirmation: ${tomCloses4 ? '✅ PASS' : '❌ FAIL'}`);
  
  // Check if Tom asks for same confirmations again
  const repeatsConfirmations = response4.reply.toLowerCase().includes('confirm') ||
                               response4.reply.toLowerCase().includes('just to be clear') ||
                               response4.reply.toLowerCase().includes('you mean');
  console.log(`✓ Doesn't repeat confirmations: ${!repeatsConfirmations ? '✅ PASS' : '❌ FAIL'}`);
  
  // Turn 5: If still going, BA asks again
  if (!tomCloses4) {
    state.turn = 5;
    console.log('\nTurn 5 (shouldn\'t happen):');
    console.log('BA: Ok let\'s do that');
    const response5 = await getAgentResponse('no_promo', state,
      "Ok let's do that", 'medium', conversationHistory);
    console.log(`TOM: ${response5.reply}`);
    
    const tomCloses5 = response5.reply.toLowerCase().includes('let\'s') ||
                       response5.reply.toLowerCase().includes('deal') ||
                       response5.reply.toLowerCase().includes('start');
    console.log(`\n✓ Tom finally closes: ${tomCloses5 ? '✅ PASS' : '❌ FAIL - Still not closing!'}`);
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('SUMMARY:');
  console.log('✓ Agent should close when main concern (no POSM) is addressed');
  console.log('✓ Shouldn\'t ask for same confirmations repeatedly');
  console.log('✓ Should recognize "deal?" as closure request');
  console.log('✓ Must close within 4-5 turns when conditions are met');
  console.log('=' .repeat(60));
}

// Run the test
testDealClosure().catch(console.error);
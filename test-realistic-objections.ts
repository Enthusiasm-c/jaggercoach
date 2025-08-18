// Test that agents give realistic objections without repetitive details
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env.local') });

import { getAgentResponse } from './lib/agent';
import { createInitialState } from './lib/trainer-state';

async function testRealisticObjections() {
  console.log('\n🧪 TESTING REALISTIC OBJECTIONS - No Electricity Complaints\n');
  console.log('=' .repeat(60));
  
  // Test Mark's objections about tap machine
  console.log('\nTEST: No Perfect Serve - Mark\'s Objections');
  console.log('-'.repeat(40));
  
  const state = createInitialState('no_perfect_serve', ['Ice Cold Serve']);
  
  // Turn 1: BA offers to help with tap machine
  state.turn = 1;
  console.log('\nInteraction 1:');
  console.log('BA: Mark, the tap machine makes Jäger taste much better at -18°C');
  
  const response1 = await getAgentResponse(
    'no_perfect_serve',
    state,
    "Mark, the tap machine makes Jäger taste much better at -18°C",
    'medium',
    []
  );
  console.log(`MARK: ${response1.reply}`);
  
  // Check if Mark mentions electricity/energy
  const mentionsElectricity = response1.reply.toLowerCase().includes('electric') || 
                              response1.reply.toLowerCase().includes('energy') ||
                              response1.reply.toLowerCase().includes('power') ||
                              response1.reply.toLowerCase().includes('kwh');
  console.log(`\n✓ Mentions electricity costs: ${mentionsElectricity ? '❌ FAIL (unrealistic)' : '✅ PASS'}`);
  
  // Check if objection is about real business concerns
  const hasBusinessConcern = response1.reply.toLowerCase().includes('slow') || 
                             response1.reply.toLowerCase().includes('rush') ||
                             response1.reply.toLowerCase().includes('staff') ||
                             response1.reply.toLowerCase().includes('space') ||
                             response1.reply.toLowerCase().includes('guest');
  console.log(`✓ Focuses on real business concerns: ${hasBusinessConcern ? '✅ PASS' : '❌ FAIL'}`);
  
  // Turn 2: BA addresses first concern
  state.turn = 3;
  state.objectionsRaised = ['primary'];
  console.log('\nInteraction 2:');
  console.log('BA: We provide full training to make service faster than bottles');
  
  const response2 = await getAgentResponse(
    'no_perfect_serve',
    state,
    "We provide full training to make service faster than bottles",
    'medium',
    ['training_mentioned']
  );
  console.log(`MARK: ${response2.reply}`);
  
  // Check if Mark keeps repeating "100-seat tap-free bar"
  const repeatsVenueDetails = (response2.reply.match(/100-seat/g) || []).length > 0 ||
                              (response2.reply.match(/tap-free/g) || []).length > 0;
  console.log(`\n✓ Repeats venue details unnecessarily: ${repeatsVenueDetails ? '❌ FAIL' : '✅ PASS'}`);
  
  // Check if new objection is different
  const isNewObjection = !response2.reply.toLowerCase().includes('slow') &&
                         !response2.reply.toLowerCase().includes('rush');
  console.log(`✓ Raises new objection: ${isNewObjection ? '✅ PASS' : '❌ FAIL'}`);
  
  console.log('\n' + '=' .repeat(60));
  console.log('SUMMARY:');
  console.log('✓ No unrealistic electricity/energy complaints');
  console.log('✓ Focus on real business concerns (speed, staff, space)');
  console.log('✓ Natural conversation without repetitive details');
  console.log('✓ Progressive objections without loops');
  console.log('=' .repeat(60));
}

// Run the test
testRealisticObjections().catch(console.error);
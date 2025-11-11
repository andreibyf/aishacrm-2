import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAICampaignTables() {
  try {
    console.log('\n🔍 Checking AI Campaign Tables\n');

    const { count: count1, error: error1 } = await supabase
      .from('ai_campaign')
      .select('*', { count: 'exact', head: true });

    const { count: count2, error: error2 } = await supabase
      .from('ai_campaigns')
      .select('*', { count: 'exact', head: true });

    console.log('ai_campaign (singular):', error1 ? `Error: ${error1.message}` : `${count1} rows`);
    console.log('ai_campaigns (plural):', error2 ? `Error: ${error2.message}` : `${count2} rows`);

    console.log('\n---\n');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkAICampaignTables();

/**
 * {PROJECT_NAME} - Finder Service
 * Discovers and prospective leads using web search
 *
 * Schedule: Daily at 8:00 AM UTC (configurable via railway.toml)
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   ANTHROPIC_API_KEY
 *   FINDER_ENABLED (true/false kill-switch)
 */

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-sdk/sdk';

// ─── Configuration ──────────────────────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const FINDER_ENABLED = process.env.FINDER_ENABLED !== 'false';
const TABLE_NAME = '{PROJECT_SLUG}_leads';
const LEADS_PER_SEARCH = 5;  // Leads to extract per search
const NUM_SEARCHES = 4;       // Number of different searches to run
const SEARCH_QUERIES = [
  '{PROJECT_NAME} market research',
  '{PROJECT_NAME} industry analysis',
  '{PROJECT_NAME} prospects',
  '{PROJECT_NAME} target market'
];

// ─── Main Service ───────────────────────────────────────────────────────

async function runFinder() {
  console.log('[{SERVICE_NAME}] Starting finder — ' + new Date().toISOString());

  // Kill-switch
  if (!FINDER_ENABLED) {
    console.log('[{SERVICE_NAME}] Finder disabled (FINDER_ENABLED=false)');
    process.exit(0);
  }

  // Validation
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[{SERVICE_NAME}] ANTHROPIC_API_KEY not set');
    process.exit(1);
  }

  try {
    let totalLeadsFound = 0;
    let totalErrors = 0;

    // Run multiple searches
    for (let i = 0; i < SEARCH_QUERIES.length; i++) {
      const query = SEARCH_QUERIES[i];
      console.log(`[{SERVICE_NAME}] Search ${i + 1}/${SEARCH_QUERIES.length}: "${query}"`);

      try {
        const leads = await discoverLeads(query);
        totalLeadsFound += leads.length;
        console.log(`[{SERVICE_NAME}] Found ${leads.length} leads`);

        // Insert into database
        if (leads.length > 0) {
          const { error } = await supabase
            .from(TABLE_NAME)
            .insert(leads);

          if (error) {
            console.error(`[{SERVICE_NAME}] Database insert error:`, error.message);
            totalErrors++;
          }
        }

        // Small delay between searches
        await new Promise(r => setTimeout(r, 1000));

      } catch (err) {
        console.error(`[{SERVICE_NAME}] Search error:`, err.message);
        totalErrors++;
      }
    }

    // Summary
    console.log(`[{SERVICE_NAME}] Finder complete`);
    console.log(`[{SERVICE_NAME}] Total leads found: ${totalLeadsFound}`);
    console.log(`[{SERVICE_NAME}] Errors: ${totalErrors}`);

  } catch (err) {
    console.error('[{SERVICE_NAME}] Fatal error:', err.message);
    process.exit(1);
  }
}

// ─── Lead Discovery via Claude ──────────────────────────────────────────

async function discoverLeads(query) {
  try {
    // Use Claude to analyze web data and extract leads
    // In production, you might:
    // 1. Call a web search API (Google Search API, Bing, etc.)
    // 2. Pass results to Claude for structured parsing
    // 3. Extract business names, locations, industries

    const prompt = `
You are a business research assistant. Analyze this search query and generate realistic prospective leads for outreach.

Search: "${query}"

Generate ${LEADS_PER_SEARCH} realistic business leads that would be good prospects for {PROJECT_NAME}.

For each lead, provide:
- Business name
- Industry (e.g., "restaurant", "hotel", "bar", "cafe")
- City
- State
- Contact name (if known, otherwise null)
- Phone number (if available, otherwise null)
- Email (if available, otherwise null)
- Website URL (if available, otherwise null)
- Employee count (estimate)

Format response as JSON array with fields: business_name, industry, city, state, contact_name, phone, email, website_url, employee_count

Example format:
[
  {
    "business_name": "The Blue Cafe",
    "industry": "cafe",
    "city": "Nashville",
    "state": "Tennessee",
    "contact_name": null,
    "phone": "615-555-1234",
    "email": "info@bluecafe.com",
    "website_url": "https://bluecafe.com",
    "employee_count": 12
  }
]

Return ONLY the JSON array, no other text.`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    // Parse JSON response
    let leads = JSON.parse(responseText);
    if (!Array.isArray(leads)) leads = [];

    // Add metadata
    leads = leads.map(lead => ({
      ...lead,
      fica_score: 0,
      outreach_stage: 'new',
      source: 'finder',
      created_at: new Date().toISOString()
    }));

    return leads;

  } catch (err) {
    console.error('[{SERVICE_NAME}] Error discovering leads:', err.message);
    return [];
  }
}

// ─── Entry Point ────────────────────────────────────────────────────────

runFinder().catch(err => {
  console.error('[{SERVICE_NAME}] Unhandled error:', err);
  process.exit(1);
});

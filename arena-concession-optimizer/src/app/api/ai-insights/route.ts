import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { runQuery } from '@/lib/queries';

const SCHEMA_CONTEXT = `
You are an analytics assistant for the Victoria Royals (WHL hockey team) concession operations at Save-On-Foods Memorial Centre.

Database schema:
- games: game_id, game_date, opponent, attendance, day_of_week, season
- transactions: id, game_id, date, time, timestamp, category, item, qty, price_point, location, is_refund
- upcoming_games: id, game_date, opponent, game_time, predicted_attendance, day_of_week

Locations: Island Canteen, Island Slice, Phillips Bar, Portable Stations, ReMax Fan Deck, TacoTacoTaco
Categories: Beer, Food, NA Bev, NA Bev PST Exempt, Snacks, Sweets, Wine Cider & Coolers, Liquor, Extras, Food - Walking Taco
Seasons: 2024-25, 2025-26

Generate a single SQLite SELECT query to answer the user's question. Return ONLY the SQL query, no explanation.
If the question cannot be answered with a query, return: CANNOT_QUERY: <reason>
`;

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();

    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        answer: 'AI insights require an ANTHROPIC_API_KEY environment variable. Set it in your .env.local file.',
        sql: null,
        data: null,
      });
    }

    const client = new Anthropic({ apiKey });

    // Step 1: Generate SQL
    const sqlResponse = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [
        { role: 'user', content: `${SCHEMA_CONTEXT}\n\nQuestion: ${question}` },
      ],
    });

    const sqlText = (sqlResponse.content[0] as any).text.trim();

    if (sqlText.startsWith('CANNOT_QUERY:')) {
      return NextResponse.json({
        answer: sqlText.replace('CANNOT_QUERY:', '').trim(),
        sql: null,
        data: null,
      });
    }

    // Clean SQL (remove markdown code fences if present)
    const cleanSql = sqlText.replace(/```sql\n?/g, '').replace(/```\n?/g, '').trim();

    // Step 2: Execute query
    let data;
    try {
      data = runQuery(cleanSql);
    } catch (err: any) {
      return NextResponse.json({
        answer: `I generated a query but it failed: ${err.message}`,
        sql: cleanSql,
        data: null,
      });
    }

    // Step 3: Interpret results
    const interpretResponse = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [
        {
          role: 'user',
          content: `You are an analytics assistant for the Victoria Royals hockey concession operations.

The user asked: "${question}"

The SQL query was: ${cleanSql}

The results are: ${JSON.stringify(data.slice(0, 50))}

Provide a clear, concise answer in 2-4 sentences. Include specific numbers. If relevant, add a brief actionable recommendation.`,
        },
      ],
    });

    const answer = (interpretResponse.content[0] as any).text.trim();

    return NextResponse.json({ answer, sql: cleanSql, data: data.slice(0, 100) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

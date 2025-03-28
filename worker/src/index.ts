// Define MCP tool types
interface MCPTool {
    name: string;
    description: string;
    parameters: Record<string, {
        type: string;
        default?: any;
        maximum?: number;
        items?: { type: string };
    }>;
    returns: {
        type: string;
        properties?: Record<string, { type: string }>;
        items?: { type: string };
    };
}

interface MCPRequest {
    tool: string;
    params: Record<string, any>;
}

interface MCPResponse {
    result: any;
}

interface Env {
    MONZO_TOKEN: string;
    MONZO_USER_ID: string;
    OPENAI_API_KEY: string;
}

// Monzo API Response Types
interface MonzoAccountsResponse {
    accounts: Array<MonzoAccount>;
}

interface MonzoAccount {
    id: string;
    description: string;
    created: string;
    type?: 'uk_retail' | 'uk_retail_joint';
    owner?: { user_id: string };
}

interface MonzoBalanceResponse {
    balance: number;
    total_balance: number;
    currency: string;
    spend_today: number;
}

interface MonzoTransactionResponse {
    transactions: Array<MonzoTransaction>;
}

interface MonzoTransaction {
    id: string;
    amount: number;
    created: string;
    currency: string;
    description: string;
    merchant?: string;
    metadata: Record<string, any>;
    notes: string;
    is_load: boolean;
    settled: string;
    category: string;
}

interface MonzoPot {
    id: string;
    name: string;
    balance: number;
    currency: string;
    created: string;
    updated: string;
    style: string;
    deleted: boolean;
}

interface MonzoPotsResponse {
    pots: Array<MonzoPot>;
}

interface MonzoErrorResponse {
    code: string;
    message: string;
}

// OpenAI API Response Types
interface OpenAIChatResponse {
    choices: Array<{
        message: {
            role: string;
            content: string;
        };
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

interface OpenAIErrorResponse {
    error: {
        message: string;
        type: string;
        code?: string;
    };
}

// Dynamically set CORS headers based on the request's Origin
const getCorsHeaders = (request: Request): Record<string, string> => {
    const origin = request.headers.get('Origin');
    // For local development, allow any localhost or local IP origin
    const allowedOrigins = [
        'http://localhost:3000',
        'http://192.168.1.43:3000'
    ];
    const isAllowed = origin && allowedOrigins.includes(origin);
    return {
        'Access-Control-Allow-Origin': isAllowed ? origin : 'http://localhost:3000',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };
};

// Utility to extract JSON from a string (e.g., from Markdown code blocks)
const extractJsonFromString = (text: string): any => {
    // Look for JSON within Markdown code blocks (```json ... ```) or standalone JSON
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/{[\s\S]*}/);
    if (jsonMatch) {
        const jsonString = jsonMatch[1] || jsonMatch[0];
        try {
            return JSON.parse(jsonString);
        } catch (error) {
            console.error('Failed to parse JSON:', jsonString, error);
            throw new Error('Invalid JSON format in response');
        }
    }
    throw new Error('No JSON found in response');
};

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const corsHeaders = getCorsHeaders(request);

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // MCP Tools Manifest
        if (url.pathname === '/mcp/tools') {
            const tools: MCPTool[] = [
                {
                    name: 'listAccounts',
                    description: 'List the user’s Monzo accounts and their user IDs',
                    parameters: {},
                    returns: { type: 'array', items: { type: 'object' } }
                },
                {
                    name: 'getBalance',
                    description: 'Get current Monzo account balance in GBP',
                    parameters: {
                        accountId: { type: 'string' }
                    },
                    returns: { type: 'object', properties: { balance: { type: 'number' } } }
                },
                {
                    name: 'listTransactions',
                    description: 'List recent Monzo transactions for an account',
                    parameters: {
                        accountId: { type: 'string' },
                        limit: { type: 'number', default: 5, maximum: 50 },
                        since: { type: 'string', default: '' }
                    },
                    returns: { type: 'array', items: { type: 'object' } }
                },
                {
                    name: 'getPots',
                    description: 'List Monzo savings pots for an account',
                    parameters: {
                        accountId: { type: 'string' }
                    },
                    returns: { type: 'array', items: { type: 'object' } }
                },
                {
                    name: 'getUserInfo',
                    description: 'Get the user ID and basic info',
                    parameters: {},
                    returns: { type: 'object' }
                },
                {
                    name: 'chatWithAI',
                    description: 'Chat with OpenAI GPT-4o to get answers about your Monzo account',
                    parameters: {
                        prompt: { type: 'string' },
                        accountId: { type: 'string' },
                        conversationHistory: { type: 'array', items: { type: 'object' }, default: [] },
                        maxTokens: { type: 'number', default: 150, maximum: 4096 }
                    },
                    returns: { type: 'object', properties: { response: { type: 'string' } } }
                }
            ];
            return new Response(JSON.stringify({ tools }), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        // MCP Tool Execution
        if (url.pathname === '/mcp/run') {
            // Validate request method
            if (request.method !== 'POST') {
                return new Response('Method not allowed. Use POST for /mcp/run', {
                    status: 405,
                    headers: corsHeaders
                });
            }

            // Read and validate the request body
            let body: string;
            try {
                body = await request.text();
                if (!body) {
                    return new Response('Request body is empty', {
                        status: 400,
                        headers: corsHeaders
                    });
                }
            } catch (error) {
                return new Response('Failed to read request body', {
                    status: 400,
                    headers: corsHeaders
                });
            }

            // Parse the body as JSON
            let requestData: MCPRequest;
            try {
                requestData = JSON.parse(body);
            } catch (error) {
                console.error('Invalid JSON body:', body);
                return new Response(`Invalid JSON body: ${body}`, {
                    status: 400,
                    headers: corsHeaders
                });
            }

            const { tool, params } = requestData;
            if (!tool || !params) {
                return new Response('Missing required fields: tool and params', {
                    status: 400,
                    headers: corsHeaders
                });
            }

            const accessToken = env.MONZO_TOKEN;
            const userId = env.MONZO_USER_ID;
            const apiKey = env.OPENAI_API_KEY;

            if (!accessToken) {
                return new Response('Monzo token not configured', { status: 401, headers: corsHeaders });
            }

            if (!apiKey) {
                return new Response('OpenAI API key not configured', { status: 401, headers: corsHeaders });
            }

            try {
                if (tool === 'listAccounts') {
                    const response = await fetch('https://api.monzo.com/accounts', {
                        headers: { Authorization: `Bearer ${accessToken}` }
                    });
                    const data = await response.json() as MonzoAccountsResponse | MonzoErrorResponse;
                    if (!response.ok) {
                        return new Response(JSON.stringify({ error: 'message' in data ? data.message : 'Failed to fetch accounts' }), {
                            status: response.status,
                            headers: corsHeaders
                        });
                    }
                    if (!('accounts' in data)) {
                        return new Response(JSON.stringify({ error: 'Invalid response format' }), {
                            status: 500,
                            headers: corsHeaders
                        });
                    }
                    const accounts = data.accounts.map((account) => ({
                        id: account.id,
                        description: account.description,
                        created: account.created,
                        userId: account.owner?.user_id || userId
                    }));
                    const result: MCPResponse = { result: accounts };
                    return new Response(JSON.stringify(result), {
                        headers: { 'Content-Type': 'application/json', ...corsHeaders }
                    });
                }

                if (tool === 'getBalance') {
                    const { accountId } = params;
                    if (!accountId) {
                        return new Response('Missing required parameter: accountId', {
                            status: 400,
                            headers: corsHeaders
                        });
                    }
                    const response = await fetch(`https://api.monzo.com/balance?account_id=${accountId}`, {
                        headers: { Authorization: `Bearer ${accessToken}` }
                    });
                    const data = await response.json() as MonzoBalanceResponse | MonzoErrorResponse;
                    if (!response.ok) {
                        return new Response(JSON.stringify({ error: 'message' in data ? data.message : 'Failed to fetch balance' }), {
                            status: response.status,
                            headers: corsHeaders
                        });
                    }
                    if (!('balance' in data)) {
                        return new Response(JSON.stringify({ error: 'Invalid response format' }), {
                            status: 500,
                            headers: corsHeaders
                        });
                    }
                    const result: MCPResponse = {
                        result: {
                            balance: data.balance / 100,
                            totalBalance: data.total_balance / 100,
                            currency: data.currency,
                            spendToday: data.spend_today / 100
                        }
                    };
                    return new Response(JSON.stringify(result), {
                        headers: { 'Content-Type': 'application/json', ...corsHeaders }
                    });
                }

                if (tool === 'listTransactions') {
                    const { accountId, limit, since } = params;
                    if (!accountId) {
                        return new Response('Missing required parameter: accountId', {
                            status: 400,
                            headers: corsHeaders
                        });
                    }
                    const limitValue = Math.min(limit || 5, 50);
                    const query = `account_id=${accountId}&limit=${limitValue}${since ? `&since=${since}` : ''}`;
                    const response = await fetch(`https://api.monzo.com/transactions?${query}`, {
                        headers: { Authorization: `Bearer ${accessToken}` }
                    });
                    const data = await response.json() as MonzoTransactionResponse | MonzoErrorResponse;
                    if (!response.ok) {
                        return new Response(JSON.stringify({ error: 'message' in data ? data.message : 'Failed to fetch transactions' }), {
                            status: response.status,
                            headers: corsHeaders
                        });
                    }
                    if (!('transactions' in data)) {
                        return new Response(JSON.stringify({ error: 'Invalid response format' }), {
                            status: 500,
                            headers: corsHeaders
                        });
                    }
                    const transactions = data.transactions.map((tx) => ({
                        id: tx.id,
                        amount: tx.amount / 100,
                        description: tx.description,
                        date: tx.created,
                        currency: tx.currency,
                        merchant: tx.merchant,
                        category: tx.category,
                        notes: tx.notes
                    }));
                    const result: MCPResponse = { result: transactions };
                    return new Response(JSON.stringify(result), {
                        headers: { 'Content-Type': 'application/json', ...corsHeaders }
                    });
                }

                if (tool === 'getPots') {
                    const { accountId } = params;
                    if (!accountId) {
                        return new Response('Missing required parameter: accountId', {
                            status: 400,
                            headers: corsHeaders
                        });
                    }
                    const response = await fetch(`https://api.monzo.com/pots?current_account_id=${accountId}`, {
                        headers: { Authorization: `Bearer ${accessToken}` }
                    });
                    if (!response.ok) {
                        const errorData = await response.json() as MonzoErrorResponse;
                        return new Response(JSON.stringify({ error: errorData.message || 'Failed to fetch pots' }), {
                            status: response.status,
                            headers: corsHeaders
                        });
                    }
                    const data = await response.json() as MonzoPotsResponse;
                    const pots = data.pots
                        .filter((pot) => !pot.deleted)
                        .map((pot) => ({
                            id: pot.id,
                            name: pot.name,
                            balance: pot.balance / 100
                        }));
                    const result: MCPResponse = { result: pots };
                    return new Response(JSON.stringify(result), {
                        headers: { 'Content-Type': 'application/json', ...corsHeaders }
                    });
                }

                if (tool === 'getUserInfo') {
                    const result: MCPResponse = { result: { userId } };
                    return new Response(JSON.stringify(result), {
                        headers: { 'Content-Type': 'application/json', ...corsHeaders }
                    });
                }

                if (tool === 'chatWithAI') {
                    const { prompt, accountId, conversationHistory = [], maxTokens } = params;
                    if (!prompt || !accountId) {
                        return new Response('Missing required parameters: prompt and accountId', {
                            status: 400,
                            headers: corsHeaders
                        });
                    }

                    // Step 1: Use GPT-4o to interpret the user's query and decide which Monzo tool to call
                    const systemPrompt = `
You are a helpful assistant that can interact with a user's Monzo bank account. The user has asked: "${prompt}". Based on this query, decide which of the following Monzo tools to call and with what parameters:

- listAccounts: Fetches the user's Monzo accounts. Parameters: none.
- getBalance: Fetches the balance for a specific account. Parameters: accountId (string).
- listTransactions: Fetches recent transactions for a specific account. Parameters: accountId (string), limit (number, default 5), since (string, default "").
- getPots: Fetches savings pots for a specific account. Parameters: accountId (string).
- getUserInfo: Fetches the user's ID. Parameters: none.

The accountId to use is "${accountId}". The current date is March 28, 2025. Use this date to interpret queries involving time (e.g., "this month" refers to March 2025).

Conversation history:
${JSON.stringify(conversationHistory, null, 2)}

Respond with a JSON object specifying the tool to call and the parameters to use, e.g., {"tool": "getBalance", "params": {"accountId": "acc_123"}}. If the query is unrelated to Monzo, respond with {"tool": "none", "params": {}} and provide a direct answer in the "response" field. If the query requires analysis (e.g., "Did I spend a lot this month?"), fetch the necessary data and analyze it in the next step, be consise in your responses.
`;
                    const messages = [
                        { role: 'system', content: systemPrompt },
                        ...conversationHistory,
                        { role: 'user', content: prompt }
                    ];
                    const response = await fetch('https://api.openai.com/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            model: 'gpt-4o',
                            messages,
                            max_tokens: 150,
                            temperature: 0.7
                        })
                    });
                    const aiData = await response.json() as OpenAIChatResponse | OpenAIErrorResponse;
                    if (!response.ok) {
                        return new Response(JSON.stringify({ error: 'error' in aiData ? aiData.error.message : 'Failed to get response from OpenAI' }), {
                            status: response.status,
                            headers: corsHeaders
                        });
                    }
                    if (!('choices' in aiData) || !aiData.choices[0]?.message?.content) {
                        return new Response(JSON.stringify({ error: 'Invalid response format from OpenAI' }), {
                            status: 500,
                            headers: corsHeaders
                        });
                    }

                    // Extract JSON from GPT-4o's response
                    let aiResponse: { tool: string; params: Record<string, any>; response?: string };
                    try {
                        aiResponse = extractJsonFromString(aiData.choices[0].message.content);
                    } catch (error) {
                        console.error('Failed to extract JSON from GPT-4o response:', aiData.choices[0].message.content);
                        return new Response(JSON.stringify({ error: 'Failed to parse GPT-4o response' }), {
                            status: 500,
                            headers: corsHeaders
                        });
                    }

                    if (aiResponse.tool === 'none') {
                        const result: MCPResponse = { result: { response: aiResponse.response || 'I can only help with Monzo-related queries.' } };
                        return new Response(JSON.stringify(result), {
                            headers: { 'Content-Type': 'application/json', ...corsHeaders }
                        });
                    }

                    // Step 2: Call the appropriate Monzo tool based on GPT-4o's decision
                    let monzoData: any;
                    if (aiResponse.tool === 'listAccounts') {
                        const response = await fetch('https://api.monzo.com/accounts', {
                            headers: { Authorization: `Bearer ${accessToken}` }
                        });
                        const data = await response.json() as MonzoAccountsResponse | MonzoErrorResponse;
                        if (!response.ok) {
                            return new Response(JSON.stringify({ error: 'message' in data ? data.message : 'Failed to fetch accounts' }), {
                                status: response.status,
                                headers: corsHeaders
                            });
                        }
                        if (!('accounts' in data)) {
                            return new Response(JSON.stringify({ error: 'Invalid response format' }), {
                                status: 500,
                                headers: corsHeaders
                            });
                        }
                        monzoData = data.accounts.map((account) => ({
                            id: account.id,
                            description: account.description,
                            created: account.created,
                            userId: account.owner?.user_id || userId
                        }));
                    } else if (aiResponse.tool === 'getBalance') {
                        const { accountId: aiAccountId } = aiResponse.params;
                        const response = await fetch(`https://api.monzo.com/balance?account_id=${aiAccountId}`, {
                            headers: { Authorization: `Bearer ${accessToken}` }
                        });
                        const data = await response.json() as MonzoBalanceResponse | MonzoErrorResponse;
                        if (!response.ok) {
                            return new Response(JSON.stringify({ error: 'message' in data ? data.message : 'Failed to fetch balance' }), {
                                status: response.status,
                                headers: corsHeaders
                            });
                        }
                        if (!('balance' in data)) {
                            return new Response(JSON.stringify({ error: 'Invalid response format' }), {
                                status: 500,
                                headers: corsHeaders
                            });
                        }
                        monzoData = {
                            balance: data.balance / 100,
                            totalBalance: data.total_balance / 100,
                            currency: data.currency,
                            spendToday: data.spend_today / 100
                        };
                    } else if (aiResponse.tool === 'listTransactions') {
                        const { accountId: aiAccountId, limit, since } = aiResponse.params;
                        const limitValue = Math.min(limit || 5, 50);
                        const query = `account_id=${aiAccountId}&limit=${limitValue}${since ? `&since=${since}` : ''}`;
                        const response = await fetch(`https://api.monzo.com/transactions?${query}`, {
                            headers: { Authorization: `Bearer ${accessToken}` }
                        });
                        const data = await response.json() as MonzoTransactionResponse | MonzoErrorResponse;
                        if (!response.ok) {
                            return new Response(JSON.stringify({ error: 'message' in data ? data.message : 'Failed to fetch transactions' }), {
                                status: response.status,
                                headers: corsHeaders
                            });
                        }
                        if (!('transactions' in data)) {
                            return new Response(JSON.stringify({ error: 'Invalid response format' }), {
                                status: 500,
                                headers: corsHeaders
                            });
                        }
                        monzoData = data.transactions.map((tx) => ({
                            id: tx.id,
                            amount: tx.amount / 100,
                            description: tx.description,
                            date: tx.created,
                            currency: tx.currency,
                            merchant: tx.merchant,
                            category: tx.category,
                            notes: tx.notes
                        }));
                    } else if (aiResponse.tool === 'getPots') {
                        const { accountId: aiAccountId } = aiResponse.params;
                        const response = await fetch(`https://api.monzo.com/pots?current_account_id=${aiAccountId}`, {
                            headers: { Authorization: `Bearer ${accessToken}` }
                        });
                        if (!response.ok) {
                            const errorData = await response.json() as MonzoErrorResponse;
                            return new Response(JSON.stringify({ error: errorData.message || 'Failed to fetch pots' }), {
                                status: response.status,
                                headers: corsHeaders
                            });
                        }
                        const data = await response.json() as MonzoPotsResponse;
                        monzoData = data.pots
                            .filter((pot) => !pot.deleted)
                            .map((pot) => ({
                                id: pot.id,
                                name: pot.name,
                                balance: pot.balance / 100
                            }));
                    } else if (aiResponse.tool === 'getUserInfo') {
                        monzoData = { userId };
                    } else {
                        return new Response('Tool not found', { status: 404, headers: corsHeaders });
                    }

                    // Step 3: Use GPT-4o to format the response in a conversational way
                    const formatPrompt = `
You are a helpful assistant. The user asked: "${prompt}". You have fetched the following data from Monzo:

${JSON.stringify(monzoData, null, 2)}

Conversation history:
${JSON.stringify(conversationHistory, null, 2)}

The current date is March 28, 2025. Use this date to interpret queries involving time (e.g., "this month" refers to March 2025).

Format this data into a conversational response that answers the user's query. Be concise, natural, and insightful. If the query involves analysis (e.g., "Did I spend a lot this month?"), analyze the data and provide a thoughtful response. For example, if asked about spending on a specific merchant, calculate the total spend and compare it to typical spending patterns if possible. If the data is insufficient, explain why and suggest what might help (e.g., fetching more transactions).
`;
                    const formatMessages = [
                        { role: 'system', content: 'You are a helpful assistant.' },
                        ...conversationHistory,
                        { role: 'user', content: formatPrompt }
                    ];
                    const formatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            model: 'gpt-4o',
                            messages: formatMessages,
                            max_tokens: maxTokens || 150,
                            temperature: 0.7
                        })
                    });
                    const formatData = await formatResponse.json() as OpenAIChatResponse | OpenAIErrorResponse;
                    if (!formatResponse.ok) {
                        return new Response(JSON.stringify({ error: 'error' in formatData ? formatData.error.message : 'Failed to format response with OpenAI' }), {
                            status: formatResponse.status,
                            headers: corsHeaders
                        });
                    }
                    if (!('choices' in formatData) || !formatData.choices[0]?.message?.content) {
                        return new Response(JSON.stringify({ error: 'Invalid response format from OpenAI' }), {
                            status: 500,
                            headers: corsHeaders
                        });
                    }
                    const result: MCPResponse = { result: { response: formatData.choices[0].message.content } };
                    return new Response(JSON.stringify(result), {
                        headers: { 'Content-Type': 'application/json', ...corsHeaders }
                    });
                }

                return new Response('Tool not found', { status: 404, headers: corsHeaders });
            } catch (error) {
                console.error('Error in MCP tool execution:', error);
                return new Response(JSON.stringify({ error: 'Internal server error' }), {
                    status: 500,
                    headers: corsHeaders
                });
            }
        }

        return new Response('Monzo MCP Server', { status: 200, headers: corsHeaders });
    }
};
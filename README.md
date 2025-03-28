# Monzo MCP Chat App with OpenAI GPT-4o

A chat application that integrates with the Monzo API to fetch banking data (accounts, balances, transactions, and pots) and uses OpenAI's GPT-4o model to provide intelligent, conversational responses to user queries. Built with Cloudflare Workers, Next.js, and Shadcn UI.

## Features
- **Monzo Integration**: Fetch your Monzo account details, balance, recent transactions, and savings pots.
- **OpenAI GPT-4o**: Ask natural language questions (e.g., "Did I spend a lot this month on Deliveroo?") and get insightful, conversational responses.
- **Conversation History**: Maintains context across multiple queries for a seamless chat experience.
- **Secure Deployment**: Uses Cloudflare Workers for the backend and Cloudflare Pages for the frontend.

## Prerequisites
- **Monzo Developer Account**: You need a Monzo developer account to obtain an `access_token` and `user_id`. Sign up at [Monzo Developer Portal](https://developers.monzo.com/).
- **OpenAI API Key**: You need an OpenAI API key with access to GPT-4o. Sign up at [OpenAI Platform](https://platform.openai.com/).
- **Cloudflare Account**: You need a Cloudflare account to deploy the Worker and Pages. Sign up at [Cloudflare](https://www.cloudflare.com/).
- **Node.js**: Version 16 or later. Install from [Node.js](https://nodejs.org/).
- **Wrangler CLI**: Cloudflare’s CLI tool for managing Workers. Install with:
  ```bash
  npm install -g wrangler
  ```

## Usage

Open the deployed frontend URL (e.g., https://monzo-chat.yourdomain.pages.dev).

The app will fetch your Monzo accounts and select the first one.

Start chatting! Ask questions like:
```bash
"What’s my balance?"
"Did I spend a lot this month on Deliveroo?"
"Show my pots"
"How does my spending this month compare to last month?"
```
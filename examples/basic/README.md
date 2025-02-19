# Basic BinkOS Example

This example demonstrates basic usage of BinkOS core functionality, including:

- Creating a wallet
- Initializing an agent
- Interacting with the agent

## Prerequisites

- Node.js 16+
- pnpm
- OpenAI API Key

## Setup

1. Install dependencies from the root of the monorepo:

```bash
pnpm install
```

2. Copy the example environment file:

```bash
cp .env.example .env
```

3. Edit `.env` and add your OpenAI API key:

```
OPENAI_API_KEY=your-api-key-here
```

The example uses BinkOS's Settings system which will automatically load configuration from your `.env` file. Optionally, you can also set a specific wallet mnemonic. If not provided, a random one will be generated.

## Running the Example

From this directory:

```bash
pnpm start
```

This will:

1. Create a new wallet with a random mnemonic (or use the one from settings if provided)
2. Initialize an agent with access to the wallet
3. Ask the agent for the wallet's address

## Expected Output

You should see output similar to:

```
Agent Response: Your wallet's address is [Solana address]
```

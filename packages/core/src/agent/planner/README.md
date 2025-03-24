# BinkOS Planning Agent

## What is the Planning Agent?

The Planning Agent is an AI assistant that helps you complete complex blockchain tasks like transferring tokens, swapping cryptocurrencies, or moving assets between different blockchains. Think of it as a smart assistant that can break down complicated requests into smaller steps, handle each step carefully, and keep you informed throughout the process.

## How Does It Work? (The Simple Version)

When you ask the Planning Agent to do something (like "Transfer 0.1 ETH to my friend's wallet"), it:

1. **Understands your request** - Figures out exactly what you want to accomplish
2. **Creates a plan** - Breaks your request into clear, manageable steps
3. **Executes each step** - Completes each task in the correct order
4. **Adapts if needed** - Can change the plan if it encounters problems
5. **Reports back to you** - Explains what happened in simple terms

## Why Is This Better Than Regular AI Assistants?

Regular AI assistants are like having a helpful friend who can do one thing at a time. The Planning Agent is more like having a professional project manager who can:

- **Handle complex tasks** - Can manage multi-step processes that regular assistants might get confused by
- **Recover from errors** - If one step fails, it can try again or find another approach
- **Work across multiple blockchains** - Understands how to work with different cryptocurrency networks
- **Keep track of everything** - Remembers where it is in a complex process and what happened previously
- **Adapt on the fly** - Changes its approach based on what happens during execution

## Real-World Examples

Here's what the Planning Agent can help you with:

- **"Swap 100 USDC to ETH and then bridge it to Polygon"** - The agent handles token approval, finds the best swap rate, executes the swap, and then completes the bridge transaction.

- **"Stake 5 SOL in the highest-yielding protocol"** - The agent researches current yields, compares options, and executes the staking transaction with the best protocol.

- **"Check my portfolio value across all my wallets"** - The agent retrieves balances from multiple blockchains and provides a comprehensive overview.

## When to Use the Planning Agent

The Planning Agent shines when you need to:

- Complete tasks that require multiple transactions
- Work with different tokens across multiple blockchains
- Execute complex financial operations
- Recover gracefully if something goes wrong during a process
- Get detailed information about what's happening with your request

For simple requests like checking a single balance or sending a basic transaction, a standard blockchain assistant might be faster.

## Benefits for Users

- **Peace of mind** - The agent carefully plans and executes transactions to avoid costly mistakes
- **Transparency** - Always knows what's happening with your request and keeps you informed
- **Adaptability** - Can handle unexpected situations that might arise during transactions
- **Simplicity** - Handles complex blockchain operations without requiring you to understand all the technical details
- **Efficiency** - Completes multi-step processes without needing constant instructions

## How the Planning Agent Works with the BinkOS Ecosystem

The Planning Agent is part of the BinkOS ecosystem, which means it has access to:

- Your connected wallet(s) (only with your permission)
- Multiple blockchain networks
- Various plugins that extend its capabilities
- Secure storage for remembering your preferences

All of this works together to provide a powerful but easy-to-use interface for managing your digital assets across the blockchain landscape.

## How the Planning Agent Works: The Workflow Explained

### The Simple View

![Planning Agent Simple Workflow](../../../docs/assets/planning-agent-simple.png)

When you ask the Planning Agent to do something, it follows this path:

1. **Supervisor**: First, it looks at your request and decides what kind of help you need.

2. It then takes one of three routes:

   - **Basic Question Path**: For simple questions that don't need complex planning
   - **Planning Path**: For tasks that need multiple steps to execute
   - **Executor Answer**: After completing tasks, it provides a clear response

3. All paths eventually lead to a complete answer to your request.

This approach helps the Planning Agent handle both simple requests efficiently and complex tasks thoroughly.

### The Expanded View

![Planning Agent Expanded Workflow](../../../docs/assets/planning-agent-expanded.png)

Behind the scenes, the Planning Agent's workflow is more intricate:

1. **Supervisor**: Analyzes your request and routes it to the appropriate system.

2. If it's a **Basic Question**:

   - The agent calls relevant tools to find information
   - It crafts a response directly without complex planning
   - This path is fast and efficient for simple queries

3. If it needs **Planning**:

   - **Create Plan**: Breaks down your request into specific tasks
   - **Update Plan**: Continuously refines the plan as tasks complete
   - **Select Tasks**: Determines which tasks to execute next
   - These components work together to create and manage a smart execution plan

4. For the **Execution**:

   - **Executor Agent**: Takes the selected tasks and executes them
   - Uses specialized tools to interact with blockchains
   - Can terminate if needed (e.g., if errors can't be resolved)
   - Reports results back to the planner

5. Finally, the **Executor Answer** system:
   - Collects all results from the execution
   - Translates technical details into human-friendly language
   - Presents you with a clear summary of what was accomplished

This multi-stage process allows the Planning Agent to handle very complex blockchain operations while keeping you informed every step of the way. Most importantly, all this complexity happens behind the scenes, so you only need to make a simple request to get powerful results.

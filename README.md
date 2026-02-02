# OSC-Agent

> (Open Source Contributing Agent) - Autonomous CLI that acts as an AI open-source contributor

## Overview

OSC-Agent is an intelligent autonomous system designed to revolutionize open-source contributions. It analyzes GitHub issues, surgically searches codebases, generates verified fixes, and automatically creates pull requests - all with minimal human intervention.

## Features

### 🔍 Intelligent Issue Analysis
- Automatically fetches and analyzes GitHub issues
- Understands context and requirements from issue descriptions
- Prioritizes issues based on complexity and impact

### 🔎 Surgical Code Search
- Powered by ripgrep for ultra-fast code searching
- Context-aware code pattern matching
- Efficient navigation through large codebases

### 🧠 AI-Powered Fix Generation
- Multi-agent workflow using Gemini models
- Cost-optimized model routing for different task complexities
- Intelligent code generation with context understanding

### 🧪 Automated Testing & Verification
- E2B sandbox integration for safe testing
- Self-correction loops for iterative improvement
- Automated test execution and validation

### 📝 Automated Pull Requests
- Creates well-documented PRs automatically
- Includes detailed change descriptions
- Links back to original issues

### 🔄 Graph-Based Orchestration
- State machine workflow management
- Intelligent task routing and execution
- Robust error handling and recovery

## Architecture

OSC-Agent is built on a modular, graph-based architecture:

```
┌─────────────────┐
│  GitHub API     │
│  Integration    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Issue Analyzer │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Code Search    │
│  (ripgrep)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Multi-Agent    │
│  Fix Generator  │
│  (Gemini)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  E2B Sandbox    │
│  Testing        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  PR Creator     │
└─────────────────┘
```

### Key Components

1. **Graph Orchestrator**: Manages the workflow state and coordinates between different agents
2. **Multi-Agent System**: Specialized agents for different tasks (analysis, code generation, testing)
3. **Testing Framework**: Self-correction loops with E2B sandbox integration
4. **Model Router**: Optimizes costs by routing tasks to appropriate Gemini models

## Installation

```bash
# Clone the repository
git clone https://github.com/DaniyalFaraz2003/OSC-Agent.git
cd OSC-Agent

# Install dependencies
npm install
```

## Usage

Once implemented, the CLI will support:

```bash
# Analyze and fix an issue
osc --repo <owner/repo> --issue <issue-number>

# Run in autonomous mode
osc --repo <owner/repo> --auto

# Custom configuration
osc --config ./config.yaml
```

## Configuration

Create a `.env` file or `config.yaml` with:

```yaml
github:
  token: YOUR_GITHUB_TOKEN
  
gemini:
  api_key: YOUR_GEMINI_API_KEY
  model_tier: auto  # auto, basic, advanced
  
e2b:
  api_key: YOUR_E2B_API_KEY
  
testing:
  max_iterations: 3
  timeout: 300
```

## Development

### Prerequisites
- Node.js >= 18
- ripgrep installed
- GitHub API access token
- Gemini API key
- E2B API key

### Project Structure

```
osc-agent/
├── src/
│   ├── agents/          # AI agent implementations
│   ├── orchestrator/    # Graph-based workflow
│   ├── search/          # Code search utilities
│   ├── testing/         # E2B sandbox integration
│   └── github/          # GitHub API integration
├── tests/
├── config/
└── docs/
```

## Workflow

1. **Issue Discovery**: Fetches open issues from target repository
2. **Analysis**: AI agents analyze issue requirements and context
3. **Code Search**: ripgrep locates relevant code sections
4. **Fix Generation**: Gemini models generate potential fixes
5. **Testing**: E2B sandbox tests fixes with self-correction
6. **PR Creation**: Automatic pull request submission
7. **Monitoring**: Tracks PR status and responds to feedback

## Cost Optimization

OSC-Agent implements intelligent model routing:
- **Simple fixes**: Uses cost-effective Gemini models
- **Complex changes**: Routes to advanced models
- **Caching**: Reuses analysis results when possible
- **Batch processing**: Groups similar operations

## Contributing

We welcome contributions! To get started:

### Development Setup

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run in development mode
npm run dev
```

## Roadmap

- [ ] Multi-language support
- [ ] Advanced code review integration
- [ ] Custom agent training
- [ ] Team collaboration features
- [ ] Performance metrics dashboard
- [ ] Self-hosted deployment options

## License

MIT License

## Acknowledgments

- Built with Gemini AI models
- Powered by E2B sandboxes
- Code search by ripgrep
- Orchestrated with graph-based workflows

## Support

For issues, questions, or contributions:
- 📧 Email: support@osc-agent.dev
- 🐛 Issues: [GitHub Issues](https://github.com/DaniyalFaraz2003/OSC-Agent/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/DaniyalFaraz2003/OSC-Agent/discussions)

---

**Note**: OSC-Agent is currently in active development. Features and APIs may change.

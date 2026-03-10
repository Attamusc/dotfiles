---
name: skill-creator
description: Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends the assistant's capabilities with specialized knowledge, workflows, or tool integrations.
---

# Skill Creator

This skill provides guidance for creating effective skills.

## About Skills

Skills are modular, self-contained packages that extend the assistant's capabilities by providing
specialized knowledge, workflows, and tools. Think of them as "onboarding guides" for specific
domains or tasks — they transform a general-purpose agent into a specialized agent
equipped with procedural knowledge that no model can fully possess.

### What Skills Provide

1. Specialized workflows - Multi-step procedures for specific domains
2. Tool integrations - Instructions for working with specific file formats or APIs
3. Domain expertise - Company-specific knowledge, schemas, business logic
4. Bundled resources - Scripts, references, and assets for complex and repetitive tasks

## Core Principles

### Concise is Key

The context window is a public good. Skills share the context window with everything else the assistant needs: system prompt, conversation history, other Skills' metadata, and the actual user request.

**Default assumption: the assistant is already very smart.** Only add context it doesn't already have. Challenge each piece of information: "Does it really need this explanation?" and "Does this paragraph justify its token cost?"

Prefer concise examples over verbose explanations.

### Set Appropriate Degrees of Freedom

Match the level of specificity to the task's fragility and variability:

**High freedom (text-based instructions)**: Use when multiple approaches are valid, decisions depend on context, or heuristics guide the approach.

**Medium freedom (pseudocode or scripts with parameters)**: Use when a preferred pattern exists, some variation is acceptable, or configuration affects behavior.

**Low freedom (specific scripts, few parameters)**: Use when operations are fragile and error-prone, consistency is critical, or a specific sequence must be followed.

Think of the assistant as exploring a path: a narrow bridge with cliffs needs specific guardrails (low freedom), while an open field allows many routes (high freedom).

### Anatomy of a Skill

Every skill consists of a required SKILL.md file and optional bundled resources:

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter metadata (required)
│   │   ├── name: (required)
│   │   └── description: (required)
│   └── Markdown instructions (required)
└── Bundled Resources (optional)
    ├── scripts/          - Executable code (Python/Bash/etc.)
    ├── references/       - Documentation intended to be loaded into context as needed
    └── assets/           - Files used in output (templates, icons, fonts, etc.)
```

#### SKILL.md (required)

Every SKILL.md consists of:

- **Frontmatter** (YAML): Contains `name` and `description` fields. These are the only fields used to determine when the skill gets activated, so it is very important to be clear and comprehensive in describing what the skill is, and when it should be used.
- **Body** (Markdown): Instructions and guidance for using the skill. Only loaded AFTER the skill triggers (if at all).

#### Bundled Resources (optional)

##### Scripts (`scripts/`)

Executable code (Python/Bash/etc.) for tasks that require deterministic reliability or are repeatedly rewritten.

- **When to include**: When the same code is being rewritten repeatedly or deterministic reliability is needed
- **Example**: `scripts/rotate_pdf.py` for PDF rotation tasks
- **Benefits**: Token efficient, deterministic, may be executed without loading into context

##### References (`references/`)

Documentation and reference material intended to be loaded as needed into context.

- **When to include**: For documentation the assistant should reference while working
- **Examples**: `references/finance.md` for financial schemas, `references/api_docs.md` for API specifications
- **Benefits**: Keeps SKILL.md lean, loaded only when needed
- **Best practice**: If files are large (>10k words), include grep search patterns in SKILL.md
- **Avoid duplication**: Information should live in either SKILL.md or references files, not both

##### Assets (`assets/`)

Files not intended to be loaded into context, but rather used within the output produced.

- **When to include**: When the skill needs files that will be used in the final output
- **Examples**: `assets/logo.png` for brand assets, `assets/slides.pptx` for PowerPoint templates

### Progressive Disclosure Design Principle

Skills use a three-level loading system to manage context efficiently:

1. **Metadata (name + description)** - Always in context (~100 words)
2. **SKILL.md body** - When skill triggers (<5k words)
3. **Bundled resources** - As needed (unlimited because scripts can be executed without reading into context)

Keep SKILL.md body to the essentials and under 500 lines to minimize context bloat. Split content into separate files when approaching this limit.

**Key principle:** When a skill supports multiple variations, frameworks, or options, keep only the core workflow and selection guidance in SKILL.md. Move variant-specific details into separate reference files.

## Skill Creation Process

### Step 1: Understand the Skill with Concrete Examples

To create an effective skill, clearly understand concrete examples of how the skill will be used. This understanding can come from either direct user examples or generated examples validated with user feedback.

Ask focused questions:
- "What functionality should this skill support?"
- "Can you give some examples of how this skill would be used?"
- "What would a user say that should trigger this skill?"

Conclude this step when there is a clear sense of the functionality the skill should support.

### Step 2: Plan the Reusable Skill Contents

Analyze each example by:
1. Considering how to execute on the example from scratch
2. Identifying what scripts, references, and assets would be helpful when executing these workflows repeatedly

### Step 3: Create the Skill Directory

Create the skill directory with the standard structure:

```bash
mkdir -p <skill-name>/{scripts,references,assets}
```

Create a `SKILL.md` with proper frontmatter:

```markdown
---
name: <skill-name>
description: "<comprehensive description of what the skill does and when to use it>"
---

# <Skill Title>

## Workflow

[Core instructions here]

## References

- [reference-name.md](references/reference-name.md) - Description
```

### Step 4: Edit the Skill

When editing the skill, remember that the skill is being created for another AI assistant instance to use. Include information that would be beneficial and non-obvious.

#### Learn Proven Design Patterns

Consult these guides based on your skill's needs:

- **Multi-step processes**: See references/workflows.md for sequential workflows and conditional logic
- **Specific output formats or quality standards**: See references/output-patterns.md for template and example patterns

#### Writing Guidelines

Always use imperative/infinitive form.

##### Frontmatter

Write the YAML frontmatter with `name` and `description`:

- `name`: The skill name
- `description`: This is the primary triggering mechanism. Include both what the skill does and specific triggers/contexts for when to use it. Include all "when to use" information here — not in the body. The body is only loaded after triggering.

Do not include any other fields in YAML frontmatter.

##### Body

Write instructions for using the skill and its bundled resources.

### Step 5: Iterate

After testing the skill, users may request improvements.

**Iteration workflow:**
1. Use the skill on real tasks
2. Notice struggles or inefficiencies
3. Identify how SKILL.md or bundled resources should be updated
4. Implement changes and test again

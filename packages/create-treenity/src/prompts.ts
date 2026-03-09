import { cancel, confirm, isCancel, select, text } from '@clack/prompts';

export type Template = 'minimal' | 'agent-runtime'

export type Choices = {
  projectName: string
  template: Template
  frontend: boolean
  exampleMod: boolean
}

export function parseArgs(argv: string[]): { name?: string; yes: boolean; template?: string } {
  const args = argv.slice(2)
  const templateIdx = args.findIndex(a => a === '--template' || a === '-t')
  const template = templateIdx >= 0 ? args[templateIdx + 1] : undefined
  return {
    name: args.find(a => !a.startsWith('-') && a !== template),
    yes: args.includes('-y') || args.includes('--yes'),
    template,
  }
}

export async function promptUser(nameArg?: string, yes = false, templateArg?: string): Promise<Choices> {
  // Non-interactive mode
  if (yes) {
    return {
      projectName: nameArg ?? 'my-treenity-app',
      template: (templateArg ?? 'agent-runtime') as Template,
      frontend: true,
      exampleMod: false,
    }
  }

  const projectName = nameArg ?? await text({
    message: 'Project name',
    placeholder: 'my-treenity-app',
    validate: v => v.length === 0 ? 'Required' : undefined,
  })
  if (isCancel(projectName)) { cancel(); process.exit(0) }

  const template = templateArg ?? await select({
    message: 'Template',
    options: [
      { value: 'agent-runtime', label: 'Agent Runtime', hint: 'AI agents with Guardian policies, task board, MCP' },
      { value: 'minimal', label: 'Minimal', hint: 'Bare tree + server' },
    ],
  })
  if (isCancel(template)) { cancel(); process.exit(0) }

  const frontend = await confirm({ message: 'Include frontend (React + Vite + Tailwind)?' })
  if (isCancel(frontend)) { cancel(); process.exit(0) }

  const exampleMod = String(template) === 'minimal'
    ? await confirm({ message: 'Add example mod?' })
    : false
  if (isCancel(exampleMod)) { cancel(); process.exit(0) }

  return {
    projectName: String(projectName),
    template: String(template) as Template,
    frontend: Boolean(frontend),
    exampleMod: Boolean(exampleMod),
  }
}

import type { KnownBlock } from '@slack/web-api'

export function runProgressBlocks(runId: string): KnownBlock[] {
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '*Run in progress*' },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Stop run' },
          style: 'danger',
          action_id: 'stop_run',
          value: runId,
        },
      ],
    },
  ]
}

export function runCompletedBlocks(args: { prUrl?: string | null; previewUrl?: string | null }): KnownBlock[] {
  const blocks: KnownBlock[] = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '*Run completed*' },
    },
  ]
  if (args.prUrl) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `<${args.prUrl}|View pull request>` },
    })
  }
  if (args.previewUrl) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `<${args.previewUrl}|Open preview>` },
    })
  }
  return blocks
}

export function runFailedBlocks(): KnownBlock[] {
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '*Run failed*' },
    },
  ]
}

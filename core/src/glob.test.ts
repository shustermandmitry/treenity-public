import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { globMatch, matchesAny } from '#glob';

describe('globMatch', () => {
  it('exact match', () => {
    assert.ok(globMatch('bash', 'bash'));
  });

  it('no match on different strings', () => {
    assert.ok(!globMatch('bash', 'curl'));
  });

  it('no partial match without wildcard', () => {
    assert.ok(!globMatch('bash', 'bash_extended'));
  });

  it('wildcard suffix', () => {
    assert.ok(globMatch('mcp_slack_*', 'mcp_slack_read'));
  });

  it('wildcard prefix', () => {
    assert.ok(globMatch('*_read', 'mcp_slack_read'));
  });

  it('wildcard middle', () => {
    assert.ok(globMatch('mcp_*_read', 'mcp_slack_read'));
  });

  it('star-only pattern matches anything', () => {
    assert.ok(globMatch('*', 'anything'));
  });

  it('dots in names are literal (not regex .)', () => {
    assert.ok(globMatch('mcp.*', 'mcp.slack'));
    assert.ok(!globMatch('mcp.slack', 'mcpXslack'));
  });

  it('special regex chars are escaped', () => {
    assert.ok(globMatch('foo(bar)', 'foo(bar)'));
    assert.ok(globMatch('a+b', 'a+b'));
    assert.ok(!globMatch('a+b', 'aab'));
  });

  it('anchored — no substring matching', () => {
    assert.ok(!globMatch('bash', 'xbash'));
    assert.ok(!globMatch('bash', 'bashx'));
  });
});

describe('matchesAny', () => {
  it('empty patterns matches nothing', () => {
    assert.ok(!matchesAny([], 'anything'));
  });

  it('matches if any pattern hits', () => {
    assert.ok(matchesAny(['bash', 'mcp_*'], 'mcp_slack'));
  });

  it('no match if all patterns miss', () => {
    assert.ok(!matchesAny(['bash', 'curl'], 'wget'));
  });

  it('first exact match short-circuits', () => {
    assert.ok(matchesAny(['bash'], 'bash'));
  });

  it('multiple wildcards', () => {
    assert.ok(matchesAny(['Read', 'Write', 'Bash:*'], 'Bash:npm'));
    assert.ok(!matchesAny(['Read', 'Write', 'Bash:*'], 'Edit'));
  });
});

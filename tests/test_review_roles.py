"""Render review profiles without reading or changing machine-local overlays."""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ReviewRoles(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.source = Path(self.tmp.name)
        shutil.copytree(ROOT / '.chezmoitemplates', self.source / '.chezmoitemplates')
        shutil.copytree(ROOT / '.data', self.source / '.data')
        self.config = self.source / 'config.toml'
        self.config.write_text('')

    def render(self, role, selector=None):
        if selector is not None:
            target = self.source / '.data-private/pi/agent/review-runner.json'
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(selector))
        return subprocess.run([
            'chezmoi', '--source', str(self.source), '--config', str(self.config),
            'execute-template', '--file', str(ROOT / f'dot_pi/agent/agents/{role}.md.tmpl'),
        ], text=True, capture_output=True)

    def test_public_pi_default(self):
        for role in ('reviewer', 'validator'):
            with self.subTest(role=role):
                result = self.render(role)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn('runner: pi\n', result.stdout)
                self.assertIn('/claude-opus-5.5', result.stdout)
                self.assertIn('tools: read, bash, write, todo', result.stdout)

    def test_native_read_only(self):
        for role in ('reviewer', 'validator'):
            with self.subTest(role=role):
                result = self.render(role, {'runner': 'claude'})
                self.assertEqual(result.returncode, 0, result.stderr)
                text = result.stdout
                for field in ('runner: claude', 'runner-version: "2.1.325"', 'model: opus',
                              'thinking: high', 'auto-exit: true', 'interactive: false',
                              'workspace-trust: existing', 'permission-mode: dontAsk',
                              'native-tools: [Read, Glob, Grep]',
                              'native-allow: [Read, Glob, Grep]',
                              'native-deny: [Bash, Edit, Write, Agent]'):
                    self.assertIn(field, text)
                for forbidden in ('\nmcp:', '\ntools:', 'git diff HEAD', 'npm test',
                                  'Write your report', 'Retrieve every referenced',
                                  'retrieve it with the `todo` tool', 'DO run tests'):
                    self.assertNotIn(forbidden, text)
                self.assertIn('Return findings inline', text)
                if role == 'reviewer':
                    self.assertIn('## Review Rubric', text)
                else:
                    self.assertIn('skills: verify-integration', text)
                    self.assertIn('Source of truth wins', text)

    def test_invalid_selector_fails_closed(self):
        for value in ({'runner': 'other'}, {}, {'runner': None}, {'runner': False},
                      {'runner': 'claude', 'unexpected': True}, []):
            with self.subTest(value=value):
                result = self.render('reviewer', value)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('review-runner', result.stderr)

    def test_explicit_pi_and_workflow_role(self):
        for role in ('reviewer', 'validator'):
            result = self.render(role, {'runner': 'pi'})
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('runner: pi\n', result.stdout)
        result = self.render('workflow-reviewer', {'runner': 'claude'})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('runner: pi\n', result.stdout)
        self.assertIn('name: workflow-reviewer', result.stdout)
        self.assertIn('tools: read, bash, write, todo', result.stdout)
        self.assertIn('/claude-opus-5.5', result.stdout)
        self.assertIn('## Review Rubric', result.stdout)

    def test_provider_mapping_stays_independent(self):
        target = self.source / '.data-private/pi/agent/model-providers.json'
        target.parent.mkdir(parents=True)
        target.write_text(json.dumps({'claude': 'fixture-provider'}))
        pi = self.render('reviewer', {'runner': 'pi'})
        native = self.render('reviewer', {'runner': 'claude'})
        workflow = self.render('workflow-reviewer')
        for result in (pi, native, workflow):
            self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('model: fixture-provider/claude-opus-5.5', pi.stdout)
        self.assertIn('model: fixture-provider/claude-opus-5.5', workflow.stdout)
        self.assertIn('model: opus\n', native.stdout)
        self.assertNotIn('fixture-provider', native.stdout)

    def test_workflow_bindings(self):
        for name in ('deep-review', 'jungle-book', 'mine-workflows', 'resume-status'):
            text = (ROOT / f'dot_pi/agent/workflows/{name}.ts').read_text()
            self.assertIn('agent: "workflow-reviewer"', text)
            self.assertNotIn('agent: "reviewer"', text)


if __name__ == '__main__':
    unittest.main()

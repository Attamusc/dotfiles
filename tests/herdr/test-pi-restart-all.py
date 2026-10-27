#!/usr/bin/env python3
"""Black-box restart protocol checks; both executables are fixture-owned."""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

CLI = Path(__file__).resolve().parents[2] / 'dot_local/bin/executable_pi-restart-all'
STUB = '''#!PYTHON
import json, os, sys, time
from pathlib import Path
p = Path(os.environ['QUEUE'])
q = json.loads(p.read_text())
a = [Path(sys.argv[0]).name, *sys.argv[1:]]
with open(os.environ['CALLS'], 'a') as f: f.write(json.dumps(a)+'\\n')
if not q: sys.exit(99)
r = q.pop(0)
p.write_text(json.dumps(q))
if a != r['argv']:
 if a[1:3] == ['agent', 'start'] and r.get('reserved_name'):
  print(json.dumps({'id':'fixture-start','error':{'code':'agent_name_taken','message':'Fixture previous agent name has not been released'}}), file=sys.stderr); sys.exit(1)
 print('unexpected argv', file=sys.stderr); sys.exit(98)
time.sleep(r.get('sleep', 0))
print(r.get('out', ''), end='')
print(r.get('err', ''), end='', file=sys.stderr)
sys.exit(r.get('code', 0))
'''


class RestartTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name in ('herdr', 'ps'):
            p = self.root / name
            p.write_text(STUB.replace('PYTHON', sys.executable))
            p.chmod(0o755)
        self.session = self.root / 'session.jsonl'
        self.session.touch()
        self.a = dict(agent='pi', agent_status='idle', pane_id='w1:p1',
                      terminal_id='term1', cwd=str(self.root), foreground_cwd=str(self.root),
                      agent_session=dict(agent='pi', kind='path', source='herdr:pi', value=str(self.session)))
        self.q = []
        self.env = dict(os.environ, PATH=f'{self.root}:{os.environ["PATH"]}',
                        HERDR_ENV='1', HERDR_PANE_ID='caller',
                        HERDR_SOCKET_PATH=str(self.root / 'not-a-live-socket'),
                        QUEUE=str(self.root / 'queue'), CALLS=str(self.root / 'calls'))

    def reply(self, argv, value=None, **kw):
        self.q.append(dict(argv=argv, **({'out': json.dumps({'result': value}) if value is not None else ''} | kw)))

    def caller(self, returned='caller'):
        self.reply(['herdr', 'pane', 'process-info', '--pane', 'caller'], {'process_info': {'pane_id': returned}})

    def agents(self, agents=None):
        self.caller()
        self.reply(['herdr', 'agent', 'list'], {'agents': agents if agents is not None else [self.a]})

    def get(self, a=None):
        self.reply(['herdr', 'agent', 'get', self.a['pane_id']], {'agent': self.a if a is None else a})

    def process(self, pid=200, cwd=None, shell=100, argv0='pi'):
        self.reply(['herdr', 'pane', 'process-info', '--pane', self.a['pane_id']],
                   {'process_info': dict(pane_id=self.a['pane_id'], shell_pid=shell,
                    foreground_process_group_id=pid, foreground_processes=[dict(pid=pid,
                    name='node' if pid != shell else 'zsh', argv0=argv0,
                    cwd=str(self.root) if cwd is None else cwd)])})

    def ps(self, live=True, **kw):
        self.reply(['ps', '-p', '200', '-o', 'pid='], **dict(out=' 200\n' if live else '', code=0 if live else 1, **kw))

    def preflight(self):
        self.get(); self.process(); self.ps()

    def quit(self):
        self.reply(['herdr', 'agent', 'prompt', self.a['pane_id'], '/quit'], {})

    def owner(self, released=True, **changes):
        value = dict(self.a, agent_status='unknown') if released else dict(self.a)
        if released:
            value.pop('agent')
            value.pop('agent_session')
        value.update(changes)
        self.reply(['herdr', 'pane', 'get', self.a['pane_id']], {'pane': value}, reserved_name=not released)

    def named(self, agent=None, error_code='agent_not_found', code=1):
        import hashlib
        name = 'restart-' + hashlib.sha256(self.a['pane_id'].encode()).hexdigest()[:16]
        if agent is None:
            error = {'id': 'fixture-name', 'error': {'code': error_code, 'message': 'Fixture name lookup result'}}
            self.reply(['herdr', 'agent', 'get', name], code=code,
                       **({'err': json.dumps(error)} if code else {'out': json.dumps(error)}))
        else:
            self.reply(['herdr', 'agent', 'get', name], {'agent': agent}, reserved_name=True)

    def start(self, ready=True, **kw):
        import hashlib
        name = 'restart-' + hashlib.sha256(self.a['pane_id'].encode()).hexdigest()[:16]
        if ready:
            self.owner(); self.named()
        self.reply(['herdr', 'agent', 'start', name, '--kind', 'pi', '--pane', self.a['pane_id'],
                    '--timeout', '30000', '--', '--session', str(self.session)], {}, **kw)

    def run_cli(self, apply=True, ok=False, extra=(), confirm=True):
        Path(self.env['QUEUE']).write_text(json.dumps(self.q))
        r = subprocess.run([sys.executable, str(CLI), '--timeout', '0.5',
                            *(['--apply'] if apply else []),
                            *(['--confirm-empty-editors'] if apply and confirm else []), *extra], env=self.env,
                           text=True, capture_output=True, timeout=8)
        self.assertEqual(r.returncode == 0, ok, r.stdout + r.stderr)
        p = Path(self.env['CALLS'])
        self.calls = [json.loads(x) for x in p.read_text().splitlines()] if p.exists() else []
        return r

    def mutations(self):
        return [c for c in self.calls if c[:3] in (['herdr', 'agent', 'prompt'], ['herdr', 'agent', 'start'])]

    def test_native_release_waits_for_record_and_name(self):
        self.agents(); self.preflight(); self.preflight(); self.quit()
        self.process(100, argv0='zsh'); self.ps(False); self.owner(released=False)
        self.process(100, argv0='zsh'); self.ps(False); self.owner(); self.named(agent=self.a)
        self.process(100, argv0='zsh'); self.ps(False); self.start(); self.get(); self.process(201)
        result = self.run_cli(ok=True, extra=('--timeout', '2'))
        self.assertIn('completed=1', result.stdout)
        self.assertEqual(len(self.mutations()), 2)
        self.assertEqual(json.loads(Path(self.env['QUEUE']).read_text()), [])

    def test_native_release_idle_record_with_missing_session_is_not_clear(self):
        self.agents(); self.preflight(); self.preflight(); self.quit()
        self.process(100, argv0='zsh'); self.ps(False)
        incomplete = dict(self.a, agent=None)
        incomplete.pop('agent_session')
        self.reply(['herdr', 'pane', 'get', self.a['pane_id']], {'pane': incomplete})
        self.process(100, argv0='zsh'); self.ps(False); self.start(); self.get(); self.process(201)
        self.run_cli(ok=True, extra=('--timeout', '2'))
        self.assertEqual(json.loads(Path(self.env['QUEUE']).read_text()), [])

    def test_native_release_missing_status_is_not_clear(self):
        self.agents(); self.preflight(); self.preflight(); self.quit()
        self.process(100, argv0='zsh'); self.ps(False)
        incomplete = dict(self.a)
        for field in ('agent', 'agent_session', 'agent_status'):
            incomplete.pop(field)
        self.reply(['herdr', 'pane', 'get', self.a['pane_id']], {'pane': incomplete})
        self.process(100, argv0='zsh'); self.ps(False); self.start(); self.get(); self.process(201)
        self.run_cli(ok=True, extra=('--timeout', '2'))
        self.assertEqual(json.loads(Path(self.env['QUEUE']).read_text()), [])

    def test_native_release_other_name_owner_aborts(self):
        self.agents(); self.preflight(); self.preflight(); self.quit()
        self.process(100, argv0='zsh'); self.ps(False); self.owner()
        self.named(agent=dict(self.a, pane_id='another-pane'))
        result = self.run_cli()
        self.assertIn('restart name belongs to another owner', result.stderr)
        self.assertEqual(len(self.mutations()), 1)

    def test_native_release_lookup_errors_are_not_available(self):
        self.agents(); self.preflight(); self.preflight(); self.quit()
        self.process(100, argv0='zsh'); self.ps(False); self.owner(); self.named(error_code='fixture_denied')
        result = self.run_cli()
        self.assertIn('fixture_denied', result.stderr)
        self.assertEqual(len(self.mutations()), 1)

    def test_native_release_zero_exit_not_found_is_not_available(self):
        self.agents(); self.preflight(); self.preflight(); self.quit()
        self.process(100, argv0='zsh'); self.ps(False); self.owner(); self.named(code=0)
        result = self.run_cli()
        self.assertIn('exit=0', result.stderr)
        self.assertEqual(len(self.mutations()), 1)

    def test_native_release_stale_record_times_out(self):
        self.agents(); self.preflight(); self.preflight(); self.quit()
        for _ in range(20):
            self.process(100, argv0='zsh'); self.ps(False); self.owner(released=False)
        result = self.run_cli()
        self.assertTrue('stage deadline expired' in result.stderr or 'timed out' in result.stderr, result.stderr)
        self.assertEqual(len(self.mutations()), 1)

    def test_native_release_stale_name_times_out(self):
        self.agents(); self.preflight(); self.preflight(); self.quit()
        for _ in range(20):
            self.process(100, argv0='zsh'); self.ps(False); self.owner(); self.named(agent=self.a)
        result = self.run_cli()
        self.assertTrue('stage deadline expired' in result.stderr or 'timed out' in result.stderr, result.stderr)
        self.assertEqual(len(self.mutations()), 1)

    def test_native_release_changed_terminal_aborts(self):
        self.agents(); self.preflight(); self.preflight(); self.quit()
        self.process(100, argv0='zsh'); self.ps(False); self.owner(terminal_id='replacement-terminal')
        result = self.run_cli()
        self.assertIn('pane ownership changed during release', result.stderr)
        self.assertEqual(len(self.mutations()), 1)

    def test_native_release_changed_session_aborts(self):
        self.agents(); self.preflight(); self.preflight(); self.quit()
        self.process(100, argv0='zsh'); self.ps(False)
        different = dict(self.a['agent_session'], value='/different-session.jsonl')
        self.owner(released=False, agent_session=different)
        result = self.run_cli()
        self.assertIn('session changed during release', result.stderr)
        self.assertEqual(len(self.mutations()), 1)

    def test_exit_wait_handles_unavailable_foreground_lists(self):
        for shape in ('omitted', 'null', 'incomplete', 'wrong-type'):
            with self.subTest(shape=shape):
                self.q = []
                Path(self.env['CALLS']).unlink(missing_ok=True)
                self.agents(); self.preflight(); self.preflight(); self.quit()
                info = dict(pane_id=self.a['pane_id'], shell_pid=100, foreground_process_group_id=100)
                if shape != 'omitted':
                    info['foreground_processes'] = {'null': None, 'incomplete': [{'pid': 100}], 'wrong-type': {}}[shape]
                self.reply(['herdr', 'pane', 'process-info', '--pane', self.a['pane_id']], {'process_info': info})
                self.process(100, argv0='zsh'); self.ps(False); self.start(); self.get(); self.process(201)
                result = self.run_cli(ok=True, extra=('--timeout', '2'))
                self.assertIn('completed=1', result.stdout)
                self.assertEqual(len(self.mutations()), 2)
                self.assertEqual(json.loads(Path(self.env['QUEUE']).read_text()), [])

    def test_readiness_wait_handles_unavailable_foreground_lists(self):
        for shape in ('omitted', 'null', 'incomplete', 'wrong-type'):
            with self.subTest(shape=shape):
                self.q = []
                Path(self.env['CALLS']).unlink(missing_ok=True)
                self.agents(); self.preflight(); self.preflight(); self.quit()
                self.process(100, argv0='zsh'); self.ps(False); self.start(); self.get()
                info = dict(pane_id=self.a['pane_id'], shell_pid=100, foreground_process_group_id=201)
                if shape != 'omitted':
                    info['foreground_processes'] = {'null': None, 'incomplete': [{'pid': 201}], 'wrong-type': {}}[shape]
                self.reply(['herdr', 'pane', 'process-info', '--pane', self.a['pane_id']], {'process_info': info})
                self.get(); self.process(201)
                result = self.run_cli(ok=True, extra=('--timeout', '2'))
                self.assertIn('completed=1', result.stdout)
                self.assertEqual(json.loads(Path(self.env['QUEUE']).read_text()), [])

    def test_preflight_still_rejects_unavailable_foreground_list(self):
        self.agents(); self.get()
        self.reply(['herdr', 'pane', 'process-info', '--pane', self.a['pane_id']],
                   {'process_info': dict(pane_id=self.a['pane_id'], shell_pid=100, foreground_process_group_id=200)})
        result = self.run_cli()
        self.assertIn('invalid foreground process list', result.stderr)
        self.assertEqual(self.mutations(), [])

    def test_wait_still_rejects_changed_owner_with_unavailable_process_list(self):
        self.agents(); self.preflight(); self.preflight(); self.quit()
        self.reply(['herdr', 'pane', 'process-info', '--pane', self.a['pane_id']],
                   {'process_info': dict(pane_id='replacement-pane', shell_pid=100)})
        result = self.run_cli()
        self.assertIn('invalid process ownership', result.stderr)
        self.assertEqual(len(self.mutations()), 1)

    def test_transient_exit_prompt_hooks_are_waited_out(self):
        self.agents(); self.preflight(); self.preflight(); self.quit()
        self.reply(['herdr', 'pane', 'process-info', '--pane', self.a['pane_id']],
                   {'process_info': dict(pane_id=self.a['pane_id'], shell_pid=100,
                    foreground_process_group_id=100, foreground_processes=[
                    dict(pid=100, name='zsh'), dict(pid=300, name='starship')])})
        self.process(300, argv0='starship')
        self.process(100, argv0='zsh'); self.ps(False); self.start(); self.get(); self.process(201)
        result = self.run_cli(ok=True, extra=('--timeout', '2'))
        self.assertIn('completed=1', result.stdout)
        self.assertEqual(len(self.mutations()), 2)
        self.assertEqual(json.loads(Path(self.env['QUEUE']).read_text()), [])

    def test_transient_startup_children_are_waited_out(self):
        self.agents(); self.preflight(); self.preflight(); self.quit()
        self.process(100, argv0='zsh'); self.ps(False); self.start(); self.get()
        self.reply(['herdr', 'pane', 'process-info', '--pane', self.a['pane_id']],
                   {'process_info': dict(pane_id=self.a['pane_id'], shell_pid=100,
                    foreground_process_group_id=201, foreground_processes=[
                    dict(pid=201, name='node'), dict(pid=301, name='helper')])})
        self.get(); self.process(301, argv0='helper')
        self.get(); self.process(201)
        self.run_cli(ok=True, extra=('--timeout', '2'))
        self.assertEqual(json.loads(Path(self.env['QUEUE']).read_text()), [])

    def test_noncanonical_caller_is_rejected(self):
        self.caller('other-pane')
        result = self.run_cli()
        self.assertIn('calling pane identity', result.stderr)
        self.assertEqual(self.mutations(), [])

    def test_session_shell_metacharacters_and_spaces_are_rejected(self):
        for name in ('session with spaces.jsonl', 'session;unsafe.jsonl', 'session$(unsafe).jsonl'):
            with self.subTest(name=name):
                Path(self.env['CALLS']).unlink(missing_ok=True)
                self.q = []
                path = self.root / name
                path.touch()
                self.a['agent_session']['value'] = str(path)
                self.agents()
                result = self.run_cli()
                self.assertIn('unsupported session path', result.stderr)
                self.assertEqual(self.mutations(), [])

    def test_apply_requires_empty_editor_confirmation(self):
        result = self.run_cli(confirm=False)
        self.assertIn('--confirm-empty-editors', result.stderr)
        self.assertEqual(self.calls, [])

    def test_preview_exclusions(self):
        others = [dict(self.a, pane_id='caller'), dict(self.a, pane_id='other', agent='claude')]
        others += [dict(self.a, pane_id=s, agent_status=s) for s in ('working', 'blocked', 'unknown')]
        self.agents([self.a, *others]); self.preflight()
        r = self.run_cli(apply=False, ok=True)
        self.assertEqual(self.mutations(), [])
        for text in ('caller', 'claude', 'working', 'blocked', 'unknown'):
            self.assertIn(text, r.stdout)

    def test_success_exact_argv_and_readiness(self):
        self.agents(); self.preflight(); self.preflight(); self.quit()
        self.process(100, argv0='zsh'); self.ps(False); self.start()
        self.get(); self.process(201)
        r = self.run_cli(ok=True)
        self.assertIn('completed=1', r.stdout)
        self.assertIn('STAGE w1:p1: submit-quit', r.stdout)
        self.assertIn('STAGE w1:p1: submit-start', r.stdout)
        self.assertIn('VERIFIED w1:p1: old_pid=200 new_pid=201', r.stdout)
        self.assertEqual(len(self.mutations()), 2)
        self.assertEqual(json.loads(Path(self.env['QUEUE']).read_text()), [])

    def test_delayed_session_metadata(self):
        self.agents(); self.preflight(); self.preflight(); self.quit()
        self.process(100, argv0='zsh'); self.ps(False); self.start()
        self.get(dict(self.a, agent_session=None)); self.process(201)
        self.get(); self.process(201)
        self.run_cli(ok=True)
        self.assertEqual(json.loads(Path(self.env['QUEUE']).read_text()), [])

    def test_all_targets_preflight_before_mutation(self):
        other = dict(self.a, pane_id='w1:p2')
        self.agents([self.a, other]); self.preflight()
        self.reply(['herdr', 'agent', 'get', 'w1:p2'], {'agent': dict(other, terminal_id=None)})
        self.run_cli(); self.assertEqual(self.mutations(), [])

    def test_partial_progress(self):
        first = self.a
        other = dict(first, pane_id='w1:p2', terminal_id='term2')
        self.agents([first, other]); self.preflight()
        self.a = other; self.preflight()
        self.a = first; self.preflight(); self.quit()
        self.process(100, argv0='zsh'); self.ps(False); self.start(); self.get(); self.process(201)
        self.a = other; self.get(dict(other, agent_status='blocked'))
        r = self.run_cli()
        self.assertIn('completed=1', r.stderr)
        self.assertIn('w1:p2', r.stderr)
        self.assertEqual(len(self.mutations()), 2)

    def test_quit_timeout(self):
        self.agents(); self.preflight(); self.preflight()
        self.reply(['herdr', 'agent', 'prompt', self.a['pane_id'], '/quit'], {}, sleep=1)
        r = self.run_cli()
        self.assertIn('timed out', r.stderr)
        self.assertEqual(len(self.mutations()), 1)

    def test_shell_pid_change(self):
        self.agents(); self.preflight(); self.preflight(); self.quit()
        self.process(101, shell=101, argv0='zsh')
        self.run_cli(); self.assertEqual(len(self.mutations()), 1)

    def test_unchanged_pid_after_start(self):
        self.agents(); self.preflight(); self.preflight(); self.quit()
        self.process(100, argv0='zsh'); self.ps(False); self.start(); self.get(); self.process(200)
        self.run_cli(); self.assertEqual(len(self.mutations()), 2)

    def test_blocked_startup(self):
        self.agents(); self.preflight(); self.preflight(); self.quit()
        self.process(100, argv0='zsh'); self.ps(False); self.start()
        self.get(dict(self.a, agent_status='blocked'))
        self.run_cli(); self.assertEqual(len(self.mutations()), 2)

    def test_allowlist_excludes_unrequested_targets_and_caller(self):
        self.agents([self.a, dict(self.a, pane_id='caller')])
        self.run_cli(apply=False, ok=True, extra=('--pane', 'caller'))
        self.assertEqual(len(self.calls), 2)

    def test_missing_requested_pane(self):
        self.agents(); self.run_cli(extra=('--pane', 'missing'))
        self.assertEqual(self.mutations(), [])

    def test_missing_terminal_identity(self):
        self.a.pop('terminal_id'); self.agents()
        self.run_cli(); self.assertEqual(self.mutations(), [])

    def test_session_directory_is_invalid(self):
        self.a['agent_session']['value'] = str(self.root); self.agents()
        self.run_cli(); self.assertEqual(self.mutations(), [])

    def test_ps_absence_with_whitespace_is_unknown(self):
        self.agents(); self.get(); self.process()
        self.reply(['ps', '-p', '200', '-o', 'pid='], out='\n', code=1)
        self.run_cli(); self.assertEqual(self.mutations(), [])

    def test_environment_required(self):
        self.env.pop('HERDR_PANE_ID'); self.run_cli(); self.assertEqual(self.calls, [])

    def test_duplicate_allowlist(self):
        self.run_cli(extra=('--pane', 'x', '--pane', 'x')); self.assertEqual(self.calls, [])

    def test_invalid_identity(self):
        self.a['agent_session']['value'] = 'relative.jsonl'
        self.agents(); self.run_cli(); self.assertEqual(self.mutations(), [])

    def test_duplicate_inventory(self):
        self.agents([self.a, self.a]); self.run_cli(); self.assertEqual(self.mutations(), [])

    def test_malformed_json(self):
        self.caller()
        self.q.append(dict(argv=['herdr', 'agent', 'list'], out='{'))
        self.run_cli(); self.assertEqual(self.mutations(), [])

    def test_command_error(self):
        self.caller()
        self.reply(['herdr', 'agent', 'list'], code=1)
        self.run_cli(); self.assertEqual(self.mutations(), [])

    def test_baseline_absent(self):
        self.agents(); self.get(); self.process(); self.ps(False)
        self.run_cli(); self.assertEqual(self.mutations(), [])

    def test_ps_unknown(self):
        self.agents(); self.get(); self.process()
        self.reply(['ps', '-p', '200', '-o', 'pid='], out='no pid', code=0)
        self.run_cli(); self.assertEqual(self.mutations(), [])

    def test_ps_permission(self):
        self.agents(); self.get(); self.process()
        self.reply(['ps', '-p', '200', '-o', 'pid='], code=1, err='permission denied')
        self.run_cli(); self.assertEqual(self.mutations(), [])

    def test_busy_before_quit(self):
        self.agents(); self.preflight(); self.get(dict(self.a, agent_status='working'))
        self.run_cli(); self.assertEqual(self.mutations(), [])

    def test_changed_identity_before_quit(self):
        self.agents(); self.preflight(); self.get(dict(self.a, terminal_id='replacement'))
        self.run_cli(); self.assertEqual(self.mutations(), [])

    def test_background_or_suspended_process_prevents_start(self):
        self.agents(); self.preflight(); self.preflight(); self.quit()
        for _ in range(10):
            self.process(100, argv0='zsh'); self.ps()
        result = self.run_cli()
        self.assertTrue('stage deadline expired' in result.stderr or 'timed out' in result.stderr, result.stderr)
        self.assertEqual(len(self.mutations()), 1)

    def test_shell_cwd_change(self):
        self.agents(); self.preflight(); self.preflight(); self.quit()
        self.process(100, cwd='/', argv0='zsh')
        self.run_cli(); self.assertEqual(len(self.mutations()), 1)

    def test_quit_never_replayed(self):
        self.agents(); self.preflight(); self.preflight()
        self.reply(['herdr', 'agent', 'prompt', self.a['pane_id'], '/quit'], code=1)
        self.run_cli(); self.assertEqual(len(self.mutations()), 1)

    def test_native_error_code_message_and_exit_are_retained(self):
        self.agents(); self.preflight(); self.preflight(); self.quit()
        self.process(100, argv0='zsh'); self.ps(False)
        error = {'id': 'fixture-start', 'error': {'code': 'fixture_start_refused', 'message': 'Fixture launch was refused'}}
        self.start(code=1, err=json.dumps(error))
        result = self.run_cli()
        self.assertIn('fixture_start_refused', result.stderr)
        self.assertIn('Fixture launch was refused', result.stderr)
        self.assertIn('exit=1', result.stderr)
        self.assertNotIn('STAGE w1:p1: verify-ready', result.stdout)
        self.assertEqual(len(self.mutations()), 2)
        self.assertEqual(json.loads(Path(self.env['QUEUE']).read_text()), [])

    def test_native_error_details_are_bounded_and_control_safe(self):
        self.caller()
        error = {'id': 'fixture-list', 'error': {'code': 'C' * 200,
                 'message': 'BEGIN\n\x1b[31m' + 'x' * 2048 + 'TRUNCATE_THIS_TAIL',
                 'data': {'transcript': 'DO_NOT_PRINT_EXTRA_FIELDS'}}}
        self.reply(['herdr', 'agent', 'list'], code=1, err=json.dumps(error))
        result = self.run_cli()
        self.assertIn('BEGIN', result.stderr)
        self.assertIn('exit=1', result.stderr)
        self.assertNotIn('TRUNCATE_THIS_TAIL', result.stderr)
        self.assertNotIn('DO_NOT_PRINT_EXTRA_FIELDS', result.stderr)
        self.assertNotIn('\x1b', result.stderr)
        self.assertEqual(result.stderr.count('\n'), 1)
        self.assertLess(len(result.stderr), 2000)
        self.assertEqual(self.mutations(), [])

    def test_non_json_native_error_is_not_dumped(self):
        self.caller()
        self.reply(['herdr', 'agent', 'list'], code=2, err='UNSTRUCTURED_PRIVATE_TEXT')
        result = self.run_cli()
        self.assertIn('exit=2', result.stderr)
        self.assertIn('JSON error unavailable', result.stderr)
        self.assertNotIn('UNSTRUCTURED_PRIVATE_TEXT', result.stderr)
        self.assertEqual(self.mutations(), [])

    def test_stdout_native_error_envelope_still_fails_closed(self):
        self.caller()
        error = {'id': 'fixture-list', 'error': {'code': 'fixture_protocol_error', 'message': 'Unexpected error envelope'}}
        self.reply(['herdr', 'agent', 'list'], out=json.dumps(error))
        result = self.run_cli()
        self.assertIn('fixture_protocol_error', result.stderr)
        self.assertEqual(self.mutations(), [])

    def test_start_failure_never_replayed(self):
        self.agents(); self.preflight(); self.preflight(); self.quit()
        self.process(100, argv0='zsh'); self.ps(False); self.start(code=1)
        self.run_cli(); self.assertEqual(len(self.mutations()), 2)

    def test_changed_session_after_start(self):
        self.agents(); self.preflight(); self.preflight(); self.quit()
        self.process(100, argv0='zsh'); self.ps(False); self.start()
        a = copy.deepcopy(self.a); a['agent_session']['value'] = str(self.root / 'different.jsonl')
        self.get(a)
        self.run_cli(); self.assertEqual(len(self.mutations()), 2)


if __name__ == '__main__':
    unittest.main()

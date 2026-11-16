function piTaskError(error, action) {
  let message = error.message;
  if (error.code === 'locked' && error.lockInfo?.session) {
    message = message.replace(' is locked.', ` is locked (session ${error.lockInfo.session}).`);
  }
  if (error.code === 'assigned') {
    message = action === 'claim'
      ? message.replace(' is assigned', ' is already assigned')
      : message.replace('Use force to override.', 'Use force to release.');
  }
  return { error: message, code: error.code };
}

// Pi owns actor identity and interactive policy; the package owns store operations.
export async function runPiTask(core, input, storeRoot, ctx) {
  const context = {
    storeRoot,
    actorId: ctx.sessionManager.getSessionId(),
    allowForce: true,
    allowedActions: core.taskActions,
  };
  try {
    return await core.executeTask(input, context);
  } catch (error) {
    if (!(error instanceof core.TaskError)) throw error;
    if (error.code !== 'stale') return piTaskError(error, input.action);
    const id = String(input.id).trim().replace(/^#/, '').replace(/^TODO-/i, '').toLowerCase();
    if (!ctx.hasUI) {
      return { error: `Todo TODO-${id} lock is stale; rerun in interactive mode to steal it.`, code: 'stale' };
    }
    const confirmed = await ctx.ui.confirm('Todo locked', `Todo TODO-${id} appears locked. Steal the lock?`);
    if (!confirmed) return { error: `Todo TODO-${id} remains locked.`, code: 'stale' };
    try {
      // Manual check-then-unlink is not atomic takeover; see README.md.
      await core.breakStaleLock(input.id, error.lockRef, { storeRoot, authorized: true });
      return await core.executeTask(input, context);
    } catch (retryError) {
      if (!(retryError instanceof core.TaskError)) throw retryError;
      return piTaskError(retryError, input.action);
    }
  }
}

'use strict';

// macOS has two independent requirements for a useful floating timer:
// raise the window level, and keep it visible across Spaces / full-screen apps.
// The second API is macOS-only and has no effect on Windows.
function applyAlwaysOnTop(win,enabled,platform=process.platform) {
  const shouldFloat=enabled===true;
  if(platform==='darwin') {
    // Apply the macOS workspace policy first, then reassert the floating level.
    // This also undoes the workspace/full-screen setting when disabled.
    win.setVisibleOnAllWorkspaces(shouldFloat,{
      visibleOnFullScreen:shouldFloat
    });
    win.setAlwaysOnTop(shouldFloat,'floating');
  } else {
    win.setAlwaysOnTop(shouldFloat);
  }
  return win.isAlwaysOnTop();
}

module.exports={applyAlwaysOnTop};

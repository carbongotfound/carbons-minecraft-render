import {chromium as engine} from 'playwright';

// Allow signed system browsers in restricted cloud runners; use Playwright's
// pinned Chromium everywhere else. Never relax TLS or browser sandbox checks.
export const chromium={async launch(options={}){
  const browser=await engine.launch({...options,...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{})});
  const newContext=browser.newContext.bind(browser);
  browser.newContext=async options=>{
    const context=await newContext(options);
    // HTTP fixtures already isolate saves. Also block realtime sockets so tests
    // cannot join the live multiplayer world behind those fixtures.
    await context.routeWebSocket(/supabase\.(co|in)/,socket=>socket.close());
    return context;
  };
  return browser;
}};

// Test-only IPC instrumentation; no diagnostics endpoint is exposed by the server.
process.on('message',message=>{if(message==='metrics')process.send({rss:process.memoryUsage().rss,cpu:process.cpuUsage()});});

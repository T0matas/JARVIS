const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const script = `
$name = "fortnite"
$locations = @(
    "$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs",
    "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs",
    "$env:PUBLIC\\Desktop",
    "$env:USERPROFILE\\Desktop"
)
foreach ($loc in $locations) {
    if (Test-Path $loc) {
        Write-Output "Searching in $loc"
        Get-ChildItem -Path $loc -Recurse -Include "*.lnk", "*.url" -ErrorAction SilentlyContinue | Where-Object { $_.BaseName -like "*$name*" } | Select-Object FullName
    }
}
`;
const tmp = path.join(os.tmpdir(), 'test_search.ps1');
fs.writeFileSync(tmp, script);
exec(`powershell -ExecutionPolicy Bypass -File "${tmp}"`, (err, stdout) => {
    console.log("FORTNITE SEARCH:");
    console.log(stdout);
});

const script2 = script.replace('fortnite', 'counter');
const tmp2 = path.join(os.tmpdir(), 'test_search2.ps1');
fs.writeFileSync(tmp2, script2);
exec(`powershell -ExecutionPolicy Bypass -File "${tmp2}"`, (err, stdout) => {
    console.log("COUNTER SEARCH:");
    console.log(stdout);
});

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/gmail.readonly'];
const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error('ERRO: Arquivo credentials.json não encontrado!');
    console.log('1. Vá para: https://console.cloud.google.com/');
    console.log('2. Crie um projeto e habilite as APIs: Google Calendar API e Gmail API.');
    console.log('3. Vá em "Credentials" -> "Create Credentials" -> "OAuth client ID".');
    console.log('4. Escolha "Desktop App" (ou Web App se configurado corretamente).');
    console.log('5. Baixe o JSON e salve como "credentials.json" na pasta do projeto.');
    process.exit(1);
}

const content = fs.readFileSync(CREDENTIALS_PATH);
const credentials = JSON.parse(content);
const { client_secret, client_id, redirect_uris } = credentials.web || credentials.installed;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
});

console.log('Autorize este app visitando este URL:');
console.log(authUrl);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

rl.question('Insira o código da página de confirmação aqui: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
        if (err) return console.error('Erro ao recuperar token de acesso', err);
        oAuth2Client.setCredentials(token);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
        console.log('Token armazenado em', TOKEN_PATH);
        console.log('J.A.R.V.I.S. agora tem acesso à sua agenda e e-mails!');
    });
});

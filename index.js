const webClient = require('tera-auth-ticket');
const versions = require('../../bin/cli/versions.json')
const clientConnections = require('../../bin/cli/index.js')

const describe = (() => {
    const races = ['Human', 'High Elf', 'Aman', 'Castanic', 'Popori', 'Baraka'];
    const genders = ['Male', 'Female'];
    const classes = ['Warrior', 'Lancer', 'Slayer', 'Berserker', 'Sorcerer', 'Archer', 'Priest', 'Mystic', 'Reaper', 'Gunner', 'Brawler', 'Ninja', 'Valkyrie'];
    return function describe(character) {
        let description = '';
        const race = races[character.race] || '?';
        const gender = genders[character.gender] || '?';
        if (character.race < 4) description += `${race} ${gender}`;
        else {
            if (character.race === 4 && character.gender === 1) description += 'Elin';
            else description += race;
          }
        description += ' ' + (classes[character['class']] || '?') + ' / ';
        description += character.level;
        return description;
    };
})();

class Client {
    constructor(mod) {
        this.autoLogin = true //disable if you want to use your own login script
        this.mod = mod
        mod.settings.$init({
            "version": 1,
            "defaults": {
	            "autoUpdateMods": false,
	            "accountEmail": "",
	            "accountPassword": "",
	            "region": "",
	            "serverName": "",
	            "characterName": ""
            }
        })
        this.settings = mod.settings

        this.connectionIndex = 0
        for (let i=0;i<clientConnections.length;i++){
            if (clientConnections[i].getClientIndex(this.settings)){
                this.connectionIndex = i
                break;
            }
        }
        this.log = require('log')(`client ${this.connectionIndex+1}`);
        this.mod.hook('S_LOAD_TOPO', 3, ()=>{
            this.mod.send('C_LOAD_TOPO_FIN', 1)
        })
        this.mod.hook('S_PING', 1, ()=>{
            this.mod.send('C_PONG', 1)
        })
        
        if(this.autoLogin){
            this.loginArbiter(()=>{
                this.characterSelect(this.settings.characterName)
            })
        }
    }
    loginArbiter(cb){
        const web = new webClient(this.settings.region, this.settings.accountEmail, this.settings.accountPassword, undefined, this.mod.dispatch.interfaceAddress);
        web.getLogin((err, data) =>{
            if(err){
                this.log.error(err);
                return;
            }
            this.mod.send('C_LOGIN_ARBITER', 2, {
                language: this.settings.region==='ru'?8:2,
				patchVersion: versions[this.settings.region].patch,
                name: data.name,
                ticket: new Buffer.from(data.ticket)
            })
            this.mod.hook('S_LOGIN_ACCOUNT_INFO', 2, e=>{
                cb()
            })
            this.mod.hook('S_LOGIN_ARBITER', 3, e=>{
                if(!e.success)cb('Arbiter login failed!')
            })
        })
    }
    characterSelect(characterName, relog){
        this.mod.send('C_GET_USER_LIST', 1)
        this.mod.hookOnce('S_GET_USER_LIST', 18, event=>{
            // parse character list
            const characters = new Map();
            for (const character of event.characters) {
                characters.set(character.name.toLowerCase(), {
                id: character.id,
                description: `${character.name} [${describe(character)}]`,
            });
            }
            // find matching character
            const character = characters.get(characterName.toLowerCase());
            if (!character) {
                this.log.error(`no character "${characterName}"`);
                this.log.error('character list:');
                for (const char of characters.values()) {
                    this.log.error(`- ${char.description} (id: ${char.id})`);
                }
            } 
            else {
                
                if(relog){
                    this.mod.hookOnce('S_RETURN_TO_LOBBY', 1, e=>{
                        this.log.log(`logging onto ${character.description} (id: ${character.id})`);
                        this.mod.send('C_SELECT_USER', 1, { id: character.id });
                    })
                }
                else {
                    this.log.log(`logging onto ${character.description} (id: ${character.id})`);
                    this.mod.send('C_SELECT_USER', 1, { id: character.id });
                }
            }
        })
    }
    relog(character) {
        this.mod.send('C_RETURN_TO_LOBBY', 1)
        this.characterSelect(character, true)
    }
    getSettings() {
        return this.settings
    }
    getIndex(){
        return this.connectionIndex
    }
}

module.exports = Client
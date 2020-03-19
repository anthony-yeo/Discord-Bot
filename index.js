const { Client, Util } = require('discord.js');
const Discord = require('discord.js');
const { TOKEN, PREFIX, GOOGLE_API_KEY } = require('./config')
const ytdl = require('ytdl-core');
const YouTube = require('simple-youtube-api');
const fs = require('fs');
const RESPONSE = require('./library');


var version = "Alpha 3.2"

const bot = new Client({disableEveryone: true});
const youtube = new YouTube(GOOGLE_API_KEY);
const queue = new Map();

bot.on('ready', () =>{
    console.log('this bot is online!');
})

//Welcome message
bot.on('guildMemberAdd', member =>{

    const channel = member.guild.channels.find(channel => channel.name === "new_people");
    if(!channel) return;

    channel.send(`Welcome to Queen Delphine's Kingdom, ${member}, please purchase Bath Water @ www.QueenDelphine.nut`)
})

//Bot login
bot.on('ready', () =>{
	bot.user.setActivity('with your sister', { type: 'Playing'});
	bot.user.setStatus('online')
})

//Playback feature
bot.on('message', async msg => { // eslint-disable-line
	if (msg.author.bot) return undefined;
	if (!msg.content.startsWith(PREFIX)) return undefined;

	const args = msg.content.split(' ');
	const searchString = args.slice(1).join(' ');
	const url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : '';
	const serverQueue = queue.get(msg.guild.id);

	let command = msg.content.toLowerCase().split(' ')[0];
	command = command.slice(PREFIX.length)

	if (command === 'play') {
		const voiceChannel = msg.member.voiceChannel;
		if (!voiceChannel) return msg.channel.send('I\'m sorry but you need to be in a voice channel to play music!');
		const permissions = voiceChannel.permissionsFor(msg.client.user);
		if (!permissions.has('CONNECT')) {
			return msg.channel.send('I cannot connect to your voice channel, make sure I have the proper permissions!');
		}
		if (!permissions.has('SPEAK')) {
			return msg.channel.send('I cannot speak in this voice channel, make sure I have the proper permissions!');
		}

		if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
			const playlist = await youtube.getPlaylist(url);
			const videos = await playlist.getVideos();
			for (const video of Object.values(videos)) {
				const video2 = await youtube.getVideoByID(video.id); // eslint-disable-line no-await-in-loop
				await handleVideo(video2, msg, voiceChannel, true); // eslint-disable-line no-await-in-loop
			}
			return msg.channel.send(`✅ Playlist: **${playlist.title}** has been added to the queue!`);
		} else {
			try {
				var video = await youtube.getVideo(url);
			} catch (error) {
				try {
					var videos = await youtube.searchVideos(searchString, 10);
					let index = 0;
					msg.channel.send(`
					__**Song selection:**__
					${videos.map(video2 => `**${++index} -** ${video2.title}`).join('\n')}
					Please provide a value to select one of the search results ranging from 1-10.
					`);
					// eslint-disable-next-line max-depth
					try {
						var response = await msg.channel.awaitMessages(msg2 => msg2.content > 0 && msg2.content < 11, {
							maxMatches: 1,
							time: 10000,
							errors: ['time']
						});
					} catch (err) {
						console.error(err);
						return msg.channel.send('No or invalid value entered, cancelling video selection.');
					}
					const videoIndex = parseInt(response.first().content);
					var video = await youtube.getVideoByID(videos[videoIndex - 1].id);
				} catch (err) {
					console.error(err);
					return msg.channel.send('🆘 I could not obtain any search results.');
				}
			}
			return handleVideo(video, msg, voiceChannel);
		}
	} else if (command === 'skip') {
		if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel dumbasss!');
		if (!serverQueue) return msg.channel.send('There is nothing playing that I could skip for you dumbass');
		serverQueue.connection.dispatcher.end('Skip command has been used!');
		return undefined;
	} else if (command === 'please_stop') {
		if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel dumbass');
		if (!serverQueue) return msg.channel.send('There is nothing playing that I could stop for you dumbass');
		serverQueue.songs = [];
		serverQueue.connection.dispatcher.end('Stop command has been used!');
		return undefined;
	} else if (command === 'stop'){
		return msg.channel.send("No.");
	} else if (command === 'volume') {
		if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel dumbass');
		if (!serverQueue) return msg.channel.send('There is nothing playing dumbass');
		if (!args[1]) return msg.channel.send(`The earrape level is currently: **${serverQueue.volume}**`);
		serverQueue.volume = args[1];
		serverQueue.connection.dispatcher.setVolumeLogarithmic(args[1] / 5);
		return msg.channel.send(`The earrape level is set to: **${args[1]}**`);
	} else if (command === 'np') {
		if (!serverQueue) return msg.channel.send('There is nothing playing dumbass');
		return msg.channel.send(`🎶 Now playing: **${serverQueue.songs[0].title}**`);
	} else if (command === 'queue') {
		if (!serverQueue) return msg.channel.send('There is nothing playing dumbass');
		return msg.channel.send(`
__**Song queue:**__
${serverQueue.songs.map(song => `**-** ${song.title}`).join('\n')}
**Now playing:** ${serverQueue.songs[0].title}
		`);
	} else if (command === 'pause') {
		if (serverQueue && serverQueue.playing) {
			serverQueue.playing = false;
			serverQueue.connection.dispatcher.pause();
			return msg.channel.send('⏸ I paused the music for you, lazy lard-ass!');
		}
		return msg.channel.send('There is nothing playing dumbass');
	} else if (command === 'resume') {
		if (serverQueue && !serverQueue.playing) {
			serverQueue.playing = true;
			serverQueue.connection.dispatcher.resume();
			return msg.channel.send('▶ I resumed the music for you, lazy lard-ass!');
		}
		return msg.channel.send('There is nothing playing dumbass');
	}

	return undefined;
});
//Playback feature
async function handleVideo(video, msg, voiceChannel, playlist = false) {
	const serverQueue = queue.get(msg.guild.id);
	console.log(video);
	const song = {
		id: video.id,
		title: Util.escapeMarkdown(video.title),
		url: `https://www.youtube.com/watch?v=${video.id}`
	};
	if (!serverQueue) {
		const queueConstruct = {
			textChannel: msg.channel,
			voiceChannel: voiceChannel,
			connection: null,
			songs: [],
			volume: 5,
			playing: true
		};
		queue.set(msg.guild.id, queueConstruct);

		queueConstruct.songs.push(song);

		try {
			var connection = await voiceChannel.join();
			queueConstruct.connection = connection;
			play(msg.guild, queueConstruct.songs[0]);
		} catch (error) {
			console.error(`I could not join the voice channel: ${error}`);
			queue.delete(msg.guild.id);
			return msg.channel.send(`I could not join the voice channel: ${error}`);
		}
	} else {
		serverQueue.songs.push(song);
		console.log(serverQueue.songs);
		if (playlist) return undefined;
		else return msg.channel.send(`✅ **${song.title}** has been added to the queue!`);
	}
	return undefined;
}
//Text functions
function play(guild, song) {
	const serverQueue = queue.get(guild.id);

	if (!song) {
		serverQueue.voiceChannel.leave();
		queue.delete(guild.id);
		return;
	}
	console.log(serverQueue.songs);

	const dispatcher = serverQueue.connection.playStream(ytdl(song.url))
		.on('end', reason => {
			if (reason === 'Stream is not generating quickly enough.') console.log('Song ended.');
			else console.log(reason);
			serverQueue.songs.shift();
			play(guild, serverQueue.songs[0]);
		})
		.on('error', error => console.error(error));
	dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);

	serverQueue.textChannel.send(`🎶 Start playing: **${song.title}**`);
}
bot.on('message', message=>{
    
    let args = message.content.substring(PREFIX.length).toLowerCase().split(" ");


    switch(args[0]){
        case "will":
            var responses = ["What a stupid question", "That's gonna be a fat no from me sailor", "That's gonna be a fat yes from me sailor", "In your dreams","Is a duck's ass water tight?", "Most likely", "Your answer is Hentai"]
			//var responses = RESPONSE
			var array_length = (responses.length - 1)
            var x = Math.floor(Math.random() * array_length)
			//message.channel.send(responses[x]);
			message.channel.send(responses[x]);
            break;
        case "should":
            var responses = ["Please don't talk to me","Depends on if you ask the British or the Dutch", "Before I do anything I ask myself, 'Would and idiot do this?, and if the asnwer is yes, I do not do that thing", "Your answer is: Hentai"]
            var array_length = (responses.length - 1)
            var x = Math.floor(Math.random() * array_length)
            message.channel.send(responses[x]);
            break;
        case "whore!":
            var responses = ["Slut!","what you've just said is one of the most insanely idiotic things I have ever heard. At no point in your rambling, incoherent response were you even close to anything that could be considered a rational thought. Everyone in this room is now dumber for having listened to it. I award you no points, and may God have mercy on your soul.", "no u"]
            var array_length = (responses.length - 1)
            var x = Math.floor(Math.random() * array_length)
            message.channel.send(responses[x]);
			break;
		case "bitch!":
			message.channel.send("Who? Jordan?");
			message.channel.send('https://chumley.barstoolsports.com/wp-content/uploads/2018/10/30/tenor.gif');
			break;
        case "send":
            if (args[1] === "nudes"){
                message.channel.send('https://coldbeef.corgiorgy.com/');
				break;
			}
			else if (args[1] === "bobs"){
				message.channel.send("https://coldbeef2.corgiorgy.com/");
				break;
			}
			else if (args[1] === "vaganae"){
				message.channel.send("https://coldbeef3.corgiorgy.com/");
				break;
			}
        case "roast":
            if (args[1] === "me"){
				var responses = ["My phone battery lasts longer than your relationships.", 
				"Oh you’re talking to me, I thought you only talked behind my back.", 
				"Too bad you can’t count jumping to conclusions and running your mouth as exercise.", 
				"If I wanted a bitch, I would have bought a dog.", 
				"My business is my business. Unless you’re a thong, get out of my ass.", 
				"It’s a shame you can’t Photoshop your personality.", 
				"Calm down. Take a deep breath and then hold it for about twenty minutes.", 
				"You should wear a condom on your head. If you’re going to be a dick, you might as well dress like one.", 
				"My middle finger gets a boner every time I see you.", 
				"You're more useless than a diamond hoe", 
				"If you were the trophy at the end of my race, I would walk backwards", 
				"It would take a team of 300,000 engineers working for nearly 10 years to design a vehicle to plumb the crushing depths of my disappointment in you right now", 
				"If you were a spice, you'd be flour", 
				"You're like a plunger. Always bringing up old shit", 
				"You have the IQ of a McChicken",
				"You the type of person to lick their finger before turning the page on a kindle", 
				"I'd talk trash behind your back but my car only has half a tank of gas", 
				"You have this 3 pound organ in your skull that's so fucking amazing it literally defies the laws of its own construction and you use it to act like a dick", 
				"There are about 3.04 trillion trees on Earth, I want you to go each one and apologize for wasting the oxygen that they produce", 
				"I've seen dropped lollipops with better facial hair than you", 
				"Looking at you is like touching wet food in the sink", 
				"Light travels faster than sound, which is why you appear bright until people hear you speak",
				"Physicists say it's hard to find or create a total vaccum, but if they were to look inside your head, they'd be surprised",
				"I wish your personality would be more diverse than the genders at a feminist gathering",
				"I fail to understand how you've become such a reprehensible fuck waffle",
				"You the type of guy to fail a DNA test",
				"You probably straightened slinkies as a kid",
				"If the sun ever starts showing signs of getting weaker, I'm going to shoot you because you're dense enough to give us another couple million years",
				"There are approximately 1,010,300 words in the English Language, but I could never string enough words together to properly express how much I want to hit you with a chair",
				"Your body fat is about evenly distributed as wealth in the U.S. economy",
				"I bet you invite yourself to your classmates' sleepovers"]
                var array_length = (responses.length - 1)
                var x = Math.floor(Math.random() * array_length)

				message.reply(responses[x]);
				message.channel.send('https://chumley.barstoolsports.com/wp-content/uploads/2018/10/30/tenor.gif')
                break;
            }
            else{
                var responses = ["My phone battery lasts longer than your relationships.", 
				"Oh you’re talking to me, I thought you only talked behind my back.", 
				"Too bad you can’t count jumping to conclusions and running your mouth as exercise.", 
				"If I wanted a bitch, I would have bought a dog.", 
				"My business is my business. Unless you’re a thong, get out of my ass.", 
				"It’s a shame you can’t Photoshop your personality.", 
				"Calm down. Take a deep breath and then hold it for about twenty minutes.", 
				"You should wear a condom on your head. If you’re going to be a dick, you might as well dress like one.", 
				"My middle finger gets a boner every time I see you.", 
				"You're more useless than a diamond hoe", 
				"If you were the trophy at the end of my race, I would walk backwards", 
				"It would take a team of 300,000 engineers working for nearly 10 years to design a vehicle to plumb the crushing depths of my disappointment in you right now", 
				"If you were a spice, you'd be flour", 
				"You're like a plunger. Always bringing up old shit", 
				"You have the IQ of a McChicken",
				"You the type of person to lick their finger before turning the page on a kindle", 
				"I'd talk trash behind your back but my car only has half a tank of gas", 
				"You have this 3 pound organ in your skull that's so fucking amazing it literally defies the laws of its own construction and you use it to act like a dick", 
				"There are about 3.04 trillion trees on Earth, I want you to go each one and apologize for wasting the oxygen that they produce", 
				"I've seen dropped lollipops with better facial hair than you", 
				"Looking at you is like touching wet food in the sink", 
				"Light travels faster than sound, which is why you appear bright until people hear you speak",
				"Physicists say it's hard to find or create a total vaccum, but if they were to look inside your head, they'd be surprised",
				"I wish your personality would be more diverse than the genders at a feminist gathering",
				"You the type of guy to fail a DNA test",
				"You probably straightened slinkies as a kid",
				"If the sun ever starts showing signs of getting weaker, I'm going to shoot you because you're dense enough to give us another couple million years",
				"There are approximately 1,010,300 words in the English Language, but I could never string enough words together to properly express how much I want to hit you with a chair",
				"Your body fat is about evenly distributed as wealth in the U.S. economy",
				"I bet you invite yourself to your classmates' sleepovers"]
                var array_length = (responses.length - 1)
                var x = Math.floor(Math.random() * array_length)
                var boom_roasted = 'https://chumley.barstoolsports.com/wp-content/uploads/2018/10/30/tenor.gif'


                message.channel.send(args[1] + ", " + responses[x])
                message.channel.send(boom_roasted);
                break;
            }
        
        case 'info':
            if(args[1] === 'version'){
                message.channel.send('Version: ' + version)
            }
            else if(args[1] == 'developer'){
                message.channel.send('Queen Delphine')
            }
            else{
                message.channel.send('Invalid argument')
            }
            break;
        case 'clear':
            if(!args[1]) return message.reply('How many messages dumbass!?');
            message.channel.bulkDelete(args[1]);
            break;

        //change this to the help commands
        case 'help':
            const embed = new Discord.RichEmbed()
            .setTitle('Bigachu Commands')
            .addField('clear', "Clears a certain amount of messages specified with an integer after the argument", true)
            //added thumbnail including the bot avatar
            .addField('send nudes', ":)")
            .addField('whore!', "No you!")
            .addField('roast me', 'Heres a suicide prevention line: 1-800-273-8255')
            .addField('roast <user>', 'If you say so, insert a poor soul after the first argument without the brackets')
            .addField('will || should', 'ask a question with the either of the following words to get an insightful answer')
            .setColor(0xff00ff)
            .setFooter('- Queen Delphine')
            message.channel.sendEmbed(embed);
			break;
		case 'coin':
			if (args[1] === 'flip'){
				if (!args[2]){
					var face = Math.floor(Math.random() * 2) + 1;
					if (face === 1){
						message.channel.send("The gods have chosen heads")	
					}
					else if (face === 2){
						message.channel.send("The gods have chosen tails")
					}
				}
			else{
			 		var face = Math.floor(Math.random() * 2) + 1;
			 		if (args[3] === '||'){
						if (face === 1){
							message.channel.send("The gods have chosen " + args[2]);
			 			}
						else if (face === 2){
			 				message.channel.send("The gods have chosen " + args[4])
			 			}
					}
					else{
						message.channel.send("Enter a || between your choices dummy")
					}
			 	}
			}
			else{
				message.reply('What do you want me to do with this coin fart head');
				message.reply(args.length)
			}

    }
})

bot.on('message', message=>{
	
	let args = message.content.toLowerCase().split(" ");

	var victim = ["Jordan", "Asher", "Anthony", "Dillon"]
	var victim_length = victim.length - 1;
	if (args[0] === 'bitch'){
		var x = Math.floor(Math.random() * victim_length);
		message.channel.send("Who? " + victim[x] + "?"); 

	}
	else if (args[0] === "im" || "i'm"){
		if (args [1] === 'killing'){
			if (args[2] === 'myself'){
				message.channel.send("Do it! Pussy!");
			}
		}
	}
})

//Add temporary mute function

//Add temporary demote function

bot.login(TOKEN);
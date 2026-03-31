const fs = require("fs");
const axios = require("axios");
const cheerio = require("cheerio");
const { execSync } = require("child_process");
const EPISODES_DIR = "./data/episodes";
const OUTPUT_DIR = "./data/playlist";

const API = "https://www.series-days.com/api/get.php";

const axiosClient = axios.create({
    timeout: 15000,
    headers:{
        "User-Agent":"Mozilla/5.0"
    }
});

function delay(ms){
    return new Promise(r=>setTimeout(r,ms));
}

function gitCommit(message){

    try{

        execSync("git add data",{stdio:"ignore"})
        execSync(`git commit -m "${message}"`,{stdio:"ignore"})
        execSync("git push",{stdio:"ignore"})

        console.log("GIT COMMIT:",message)

    }catch(e){

        console.log("GIT SKIP")

    }

}

function atomicSave(path,data){

    const temp = path + ".tmp";

    fs.writeFileSync(temp, JSON.stringify(data,null,2));

    fs.renameSync(temp, path);

}

function loadProgress(category){

    const file = `data/progress/players-${category}.json`;

    if(!fs.existsSync(file)){
        return 0;
    }

    const data = JSON.parse(fs.readFileSync(file,"utf8"));

    return data.index || 0;
}

function saveProgress(category,index){

    fs.mkdirSync("data/progress",{recursive:true});

    fs.writeFileSync(
        `data/progress/players-${category}.json`,
        JSON.stringify({index},null,2)
    );

}

async function retry(fn, times=3){
    for(let i=0;i<times;i++){
        try{
            return await fn();
        }catch(e){
            if(i===times-1) throw e;
            await delay(1000);
        }
    }
}

function convertUrl(inputUrl){

    if(!inputUrl) return "";

    const match = inputUrl.match(/id=([^&]+)/);

    if(match){

        const id = match[1];

        return `https://main.24playerhd.com/m3u8/${id}/${id}438.m3u8`;

    }

    return inputUrl;
}

async function getVideo(epUrl, episodeNumber){

    try{

        const res = await retry(()=>axiosClient.get(epUrl));

        const $ = cheerio.load(res.data);

        const btn = $(".halim-btn.active, .halim-btn").first();

        if(!btn.length){

            console.log("player button not found:",epUrl);
            return [];

        }

        const postId = btn.attr("data-post-id");
        const nonce = btn.attr("data-type") || "halim_ajax_player";

        if(!postId) return [];

        const servers = [1,2,3];

        let result = [];

        for(const server of servers){

            try{

                const params = new URLSearchParams();

                params.append("action","halim_ajax_player");
                params.append("nonce",nonce);
                params.append("episode",episodeNumber);
                params.append("postid",postId);
                params.append("lang","Thai");
                params.append("server",server);

                const player = await retry(()=>axiosClient.post(API,params,{
                    headers:{
                        "Content-Type":"application/x-www-form-urlencoded",
                        "Referer":epUrl
                    }
                }));

                const $$ = cheerio.load(player.data);

                const iframe = $$("iframe").attr("src");

                if(!iframe) continue;

                const video = convertUrl(iframe);

                if(video){

                    if(!result.find(v=>v.url===video)){

                        result.push({
                            name:"Server "+server,
                            url:video
                        });

                    }

                }

            }catch(e){
                continue;
            }

        }

        return result;

    }catch(e){

        console.log("error:",epUrl,e.message);
        return [];

    }

}

async function scrapeEpisode(ep,i){

    const epUrl = ep.url;

    if(!epUrl) return null;

    console.log("fetch:",epUrl);

    const servers = await getVideo(epUrl, ep.ep);

    await delay(500);

    return {
        name: ep.name || ep.episode || "EP"+(i+1),
        servers: servers.length ? servers : []
    };

}

async function run(){

    fs.mkdirSync(OUTPUT_DIR,{recursive:true});

    const selectedCategory = process.argv[2];

    let files = fs.readdirSync(EPISODES_DIR)
        .filter(f => f.endsWith(".json"))
        .sort();

    if(selectedCategory){
        files = files.filter(f => f.includes(selectedCategory));
    }

    const isTest = process.argv.includes("test");

    for(const file of files){

        const data = JSON.parse(
            fs.readFileSync(`${EPISODES_DIR}/${file}`,"utf8")
        );

        const category = file
            .replace("episodes-","")
            .replace(".json","");

        console.log("CATEGORY:", category);

        let result = [];

        const outputFile = `${OUTPUT_DIR}/${category}.json`;

        if(fs.existsSync(outputFile)){
            result = JSON.parse(fs.readFileSync(outputFile,"utf8"));
        }

        const seriesList = isTest ? (data[0] ? [data[0]] : []) : data;

        for(let i=0;i<seriesList.length;i++){

            const series = seriesList[i];

            console.log("SERIES:",series.title);
            console.log("Episodes:",(series.episodes || []).length);

            let episodes = series.episodes || [];

            if(isTest){
                episodes = episodes[0] ? [episodes[0]] : [];
            }

            const existsSeries = result.find(x => x.title === series.title);

            const results = existsSeries ? existsSeries.episodes || [] : [];

            for(let j=0;j<episodes.length;j++){

                const ep = episodes[j];

                const existsEp = results.find(x => x.name === ep.name);

                if(existsEp) continue;

                const r = await scrapeEpisode(ep,j);

                if(r) results.push(r);

            }

            const obj = {
                title:series.title,
                image:series.image || "",
                episodes:results
            };

            const exists = result.find(x => x.title === obj.title);

            if(!exists){
                result.push(obj);
            }else{
                exists.episodes = obj.episodes;
            }

            atomicSave(outputFile,result);

            // 🔥 commit ทุก 10 เรื่อง
            if(i % 10 === 0){
                gitCommit(`playlist ${category} ${i}`);
            }

        }

        atomicSave(outputFile,result);

        console.log("DONE ->",outputFile);

    }

}

run();




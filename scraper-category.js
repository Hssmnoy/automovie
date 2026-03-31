const axios = require("axios")
const cheerio = require("cheerio")
const fs = require("fs")
const { execSync } = require("child_process")
const categories = {

    chinese: "https://www.series-days.com/ซีรี่ย์จีน/",
    korean: "https://www.series-days.com/ซีรี่ย์เกาหลี/",
    japanese: "https://www.series-days.com/ซีรี่ย์ญี่ปุ่น/",
    thai: "https://www.series-days.com/ซีรี่ย์พากย์ไทย/",
    new: "https://www.series-days.com/ซีรี่ย์ใหม่-2025/",
    y: "https://www.series-days.com/ซีรี่ย์วาย/",
    western: "https://www.series-days.com/ซีรี่ย์ฝรั่ง/",
    netflix: "https://www.series-days.com/netflix/",
    wetv: "https://www.series-days.com/wetv/",
    iqiyi: "https://www.series-days.com/iqiyi/",
    youku: "https://www.series-days.com/youku/",
    viu: "https://www.series-days.com/viu/",
    hbo: "https://www.series-days.com/hbo/"
    
}
const selectedCategory = process.argv[2]
const isTest = process.argv.includes("test")

function getSlug(url){

    if(!url) return ""

    return url
        .replace("https://www.series-days.com/","")
        .replace(/\//g,"")

}

function sleep(ms){
    return new Promise(r=>setTimeout(r,ms))
}

function gitCommit(message){

    try{

        execSync("git add data", {stdio:"ignore"})
        execSync(`git commit -m "${message}"`, {stdio:"ignore"})
        execSync("git push", {stdio:"ignore"})

        console.log("GIT COMMIT:",message)

    }catch(e){

        console.log("GIT SKIP")

    }

}

async function scrapeCategory(name,url){

    let page = 1
    let foundNewInFirst2Pages = false

    let list = []

    fs.mkdirSync("data/series",{recursive:true})

    const file = `data/series/series-${name}.json`

    if(fs.existsSync(file)){
        list = JSON.parse(fs.readFileSync(file,"utf8"))
    }

    while(true){

        const pageUrl = page === 1 ? url : url + "page/" + page + "/"

        console.log("CATEGORY:",name,"PAGE:",page)

        try{

            const res = await axios.get(pageUrl,{
                headers:{ "User-Agent":"Mozilla/5.0" }
            })

            const $ = cheerio.load(res.data)

            const posts = $(".grid-movie .box")

            if(posts.length === 0){
                console.log("END CATEGORY:",name)
                break
            }

            let newCount = 0

            // ✅ วนดูทีละเรื่องในหน้า
            posts.each((i,el)=>{

                if(isTest && list.length >= 1){
                    return false
                }

                const link = $(el).find("a").attr("href")
                const title = $(el).find(".p2").text().trim()

                const image =
                    $(el).find("img").attr("data-lazy-src") ||
                    $(el).find("img").attr("src") ||
                    ""

                const slug = getSlug(link)

                if(!link || !title) return

                const exists = list.find(x => x.slug === slug)

                if(!exists){

                    newCount++

                    if(page <= 2){
                        foundNewInFirst2Pages = true
                    }

                    console.log("🆕 NEW SERIES:", title)

                    list.push({
                        title,
                        slug,
                        link,
                        image,
                        category:name
                    })
                }

            })

            // ❌ ถ้า 2 หน้าแรกไม่มีของใหม่เลย → หยุดทั้งหมวด
            if(page === 2 && !foundNewInFirst2Pages){
                console.log("⛔ NO NEW IN FIRST 2 PAGES → STOP")
                break
            }

            // ❌ ถ้าหน้าปัจจุบันไม่มีของใหม่ → หยุด
            if(page > 2 && newCount === 0){
                console.log("⛔ NO NEW → STOP PAGE", page)
                break
            }

            // ✅ บันทึกทุกหน้า
            fs.writeFileSync(
                file,
                JSON.stringify(list,null,2)
            )

            // ✅ commit ทุก 5 หน้า
            if(page % 5 === 0){
                gitCommit(`update ${name} page ${page}`)
            }

            page++ // 🔥 ไปหน้าถัดไป (ต้องอยู่นอก each)

            await sleep(1000)

        }catch(e){

            console.log("ERROR PAGE",page)
            break

        }

    }

    fs.writeFileSync(
        file,
        JSON.stringify(list,null,2)
    )

    console.log("SAVE data/series/series-"+name+".json")
    console.log("TOTAL:",list.length)
}

async function run(){

    // ถ้า GitHub Action ส่ง category มา
    if(selectedCategory){

        const url = categories[selectedCategory]

        if(!url){

            console.log("CATEGORY NOT FOUND:",selectedCategory)
            return

        }

        await scrapeCategory(selectedCategory,url)

        return
    }

    // ถ้า run local จะ scrape ทุก category
    for(const name in categories){

    console.log("START CATEGORY:",name)

    try{

        await scrapeCategory(name,categories[name])

    }catch(e){

        console.log("CATEGORY ERROR:",name)

    }

    console.log("DONE CATEGORY:",name)
    console.log("-------------------------")

}

}

run()



import got from 'got';
import { Cookie, CookieJar } from 'tough-cookie';
import puppeteer from 'puppeteer';
import 'dotenv/config'


import { InfluxDB, Point } from '@influxdata/influxdb-client'

const cookieJar = new CookieJar();

const token = process.env.INFLUXDB_TOKEN
const url = 'http://localhost:8086'

const client = new InfluxDB({ url, token })

let org = `myorg`
let bucket = `bath`

let writeClient = client.getWriteApi(org, bucket, 'ns')

const browser = await puppeteer.launch();
const page = await browser.newPage();

async function wait(time) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve()
        }, time);
    })
}

async function getCredentials() {
    await page.goto('https://bath.sjtu.edu.cn/');
    console.log(page.url())
    if ((new URL(page.url())).hostname === "jaccount.sjtu.edu.cn") {
        console.log("Scan the code to login:")
        await page.screenshot({ path: "login.jpg" })

        await page.waitForNavigation()
        console.log("Log in successfully.")
        await page.screenshot({ path: "bath.jpg" })
    }
    return page.cookies()
}

async function getBathNum() {

    await (got('https://bath.sjtu.edu.cn/api/me/info', {
        cookieJar
    })).catch(async (e) => {
        const cookie = (await getCredentials()).find((e) => e["name"] === "JSESSIONID")
        await cookieJar.setCookie(new Cookie({ value: cookie["value"], key: cookie["name"] }), 'https://bath.sjtu.edu.cn');
        console.log(cookieJar)
    })

    const equipments = (await got('https://bath.sjtu.edu.cn/api/water/equipments', {
        cookieJar
    }).json()).entities[0].equipment[0]
    console.log(equipments)

    await saveToInflux(equipments);

    async function saveToInflux(equipments) {
        let point = new Point('bath_people')
            .tag("dormitory_name", equipments["buildingname"])
            .intField('free', equipments["idle"])
            .intField('used', equipments["total"] - equipments["idle"]);
        writeClient.writePoint(point);
        await writeClient.flush()
    }
}
(async () => {
    while (true) {
        await getBathNum()
        await wait(15000)
    }
})()

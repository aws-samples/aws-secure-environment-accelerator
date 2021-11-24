/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as dns from 'dns';
import * as AWS from 'aws-sdk';
import { checkServerIdentity } from 'tls';
import { DNS_LOGGING_LOG_GROUP_REGION } from '@aws-accelerator/common/src/util/constants';

const zlib = require('zlib');
  
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 export const handler = async (event: any, _context: any) => {
   
    console.log(`Processing firehose records...`);
  
    const firehose_records_output: any = {};
    //# Create result object.  
    firehose_records_output.records = [];

     for (const firehose_record_input of event.records) {
         try {
             console.log(firehose_record_input);             
             let payload = Buffer.from(firehose_record_input.data, 'base64');
             const tmp = zlib.gunzipSync(payload).toString('utf-8');             
             const jsonVal = JSON.parse(tmp);
             
             if ('logGroup' in jsonVal) {
                 console.log(jsonVal.logGroup);

                 let serviceName = null;
                 if (jsonVal.logGroup.indexOf('MAD') > 0) {
                     serviceName = 'DirectoryService/MicrosoftAD';
                 } else if (jsonVal.logGroup.indexOf('SecurityHub') > 0) {
                    serviceName = 'SecurityHub';
                 } else if (jsonVal.logGroup.indexOf('rql') > 0) {
                    serviceName = 'vpcdnsquerylogs';
                 } 

                 const approxArrivalTimestamp = new Date(firehose_record_input.approximateArrivalTimestamp);

                 let rootPrefix = process.env.LOG_PREFIX || 'CloudWatchLogs';
                 if (rootPrefix[rootPrefix.length - 1] == '/') {
                     rootPrefix = rootPrefix.substring(0, rootPrefix.length - 1);
                 }

                let calculatedPrefix = rootPrefix;
                if (serviceName) {
                    calculatedPrefix += `/${serviceName}`;
                } 

                calculatedPrefix += `/${approxArrivalTimestamp.getFullYear()}`;
                calculatedPrefix += `/${(approxArrivalTimestamp.getMonth() +1).toLocaleString('en-US', {minimumIntegerDigits: 2}) }`;
                calculatedPrefix += `/${approxArrivalTimestamp.getDate().toLocaleString('en-US', {minimumIntegerDigits: 2})}`;
                calculatedPrefix += `/${approxArrivalTimestamp.getHours().toLocaleString('en-US', {minimumIntegerDigits: 2})}`;
                calculatedPrefix += `/`;

                 const partitionKeys = {
                    dynamicPrefix: calculatedPrefix
                 }
                
                 firehose_record_input.result = 'Ok',
                 firehose_record_input.metadata = {
                    partitionKeys: partitionKeys
                 }
                 // Add the record to the list of output records.  
                 firehose_records_output.records.push(firehose_record_input);

                 console.log(`${jsonVal.logGroup}`);
                 console.log(partitionKeys);
             }
             else {
                 firehose_records_output.records.push(firehose_record_input);
             }
         } catch (err) {
             console.warn(err);
             firehose_records_output.records.push(firehose_record_input);
         }
    }
    
    //console.log(firehose_records_output);

    return firehose_records_output;
 };




// handler({
//     "invocationId": "a93056b9-df4a-4a36-8294-d590bf9620b4",
//     "sourceKinesisStreamArn": "arn:aws:kinesis:ca-central-1:444111075231:stream/ASEA-Kinesis-Logs-Stream",
//     "deliveryStreamArn": "arn:aws:firehose:ca-central-1:444111075231:deliverystream/ASEA-Firehose-Delivery-Stream",
//     "region": "ca-central-1",
//     "records": [
//         {
//             "recordId": "49623566795604093650577098460107981398084216448824115202000000",
//             "approximateArrivalTimestamp": 1636837793550,
//             "data": "H4sIAAAAAAAAAK2SW2vbQBSE/4oQfbTqvV/8ptRKaGs3wlL7Epuy1q4dFV3cXalJGvLfe+wmpFAKDQSEJOYsM98Z6T5uXQhm78q7g4tn8Twt06/LrCjSiyyexP1N5zzIlAuEBdNEcAJy0+8vfD8eYDI1N2HamHZrzTQtsjTJna9bNzif5NcmOJpkzXZxmp+PXTXUfZeP26auct/b6+QQPvrim2uWlx/0b+Ni8M604EwQwVMMF51evVmkZVaUG0NtZciOWy4No6YCV66sdWRnqTJIgUUYt6Hy9eGYdF43ABLi2VX8znWDN82i3+/rbv+a1JsTdvYDAo5J93Ftj40JjohEhAoiCdecEqYUoYhrDa+EMUThrhWWTGFGFBaca4wYbDAASRhMC/ViQYWiUirGhJw8fSuwL8p0VUYr932Eo+/tLLKVNkjubAJpNGFiyxODNEl2EjkrhEK6ktEXKANWmUWPfa67+GHyNzAkMi70kYxLTBE8KUGKwC9AGTBrzYFeMIGx4v8EluRP4OzT/KW4r0An/pNuleWXL+9zPcxHb4ZTo/gtUlEb1sNZ3TTORs8TcpKXru39XVTUPx0cJipanoFobqPHwefgIJXrk37cfPPwCy+hY4ecAwAA",
//             "kinesisRecordMetadata": {
//                 "sequenceNumber": "49623566795604093650577098460107981398084216448824115202",
//                 "subsequenceNumber": 0,
//                 "partitionKey": "a5fe278dd50abfaceb08b15fa5eeac02",
//                 "shardId": "shardId-000000000000",
//                 "approximateArrivalTimestamp": 1636837793550
//             }
//         },
//         {
//             "recordId": "49623566795604093650577098460464614514870532055362437122000000",
//             "approximateArrivalTimestamp": 1636837793882,
//             "data": "H4sIAAAAAAAAAO1X2W7bRhT9FYLoW01rNs7CNyVSgrTxAlNp2koGMSLHMhMuypCUYwf+91ySckJ5aW3UDw0QSYCku567zvCLm5uq0iszu1wbN3An49k4OpiG4fj11N1zy4vCWCAzIn1KGEcSESBn5eq1LZs1cEb6ohplOl8mejQOp2PvaG2srtOyqLzjc10Z6rVkoBah0TY+D1OTH9syBrfTjSeP4z9/u7pYXpjJZW84rK3ROVgmiOARhg8dzX95O55Nw9lpEmvqM8QVFz5LNFZEJ4zHBrBJZM4QmKiaZRXbdN1CeJVmtbGVG8zdl6aorc7elqtVWqyeE/VpB3u6AQetpy9umgB6yn1EBCKUKyqwL3yKhZI+lj4nUnHKKZJcKcKwTzCQGWM+Y6iNoE6hJrXOIb0YBCUVQjLB/b2bWoH5cDY+mTkn5lMDom+SwBFYLLmQ0jPwy2MCS09RzTwE3rQyytAEOX9AMiDGwNnmc1G413t3ATMK/oTvU18iIQRTkkpJKNSeCUaQEiBEOaHK50w9DFgOAX9ZuJnZmGzhBgv3zeGro4W7t7jhAxH4ebXqucWm/GgSx1ReVurE2E60otGyiT+aupOBEmngrtrapBvjrduiIS/WcV9n7GWrc8TOPvAmy/WNgY/mstMuvXop7SdtNj4ejd+H0BXVaIcI5cAYI+ETikcvs7JJZlan2SjW3taDh0eDDh3KR9/lo6F81MrDi87gC/0dXfCj4vejv95/rievZydW7n+oymJ/ddWhhdhqGMkObtzaq1t7fSC1tnVUNPmyTU2AgGSKZEC47vTjrp87A1GUFmkdRQGjnYVvBeu4LSwPw4c6BAdIBYztCS5+RfDqHRq7SeMeS7lTlLjMkqjDA8wznVUGiGdNEbeuo0LnvdJ/HLHO1TeruclLexlV6ZXZwmdyV0LbPmz4DmDQg37Qg2EtguFGC240g2cFavvpjNKkQ/OYCf0BG/Wz1ZcR6MXmJlDscawQUUp69CxWeikSLkhillLghCFyxiHO63t3j6AS1jvxMSRFKsmQlIhhgAqrhwjCmSASw6LksDERlg/tHsX5U3YPNGiWOTBxlXNhrHG6Bk+ctKhLZ5zrq7JwpuF2KgdT1bdVdK6LJDM2oFg+crgU938O18/h+n8P14MH+93hiqAP+iN8Nuj9oYYPsXT5eK/r+PzA1DaNW5U56BxCI1drvR2B8M30oAt9AqaK9rbSyc0HJ+JwaE5P4d9de9t7xLqpoahwCzRh19Ag+w4Owo774rI2oAJpGqgcNTXoTHStH6kQNnHbquDlLQzuy7Ip6l2tLWlXa2ptaZ+oMytrnU2afnjaPO/qHKRZllYmLovkDshpdQIZhkyap+l1LrcJfBJM0PkH+VN4/8sN58Gd+GON790ODOaUYSH2Udu3t7stmPuc+0T13HtbK5grv2ff00PBHPW8e3olmBO0dXu7HQATHujtFjyY3+J9p/st5xlWDXnwoefWqpkeTp76yPMM6PAj0Z1Mj4+e/ky2qG/qFDhYqX2OnLxa1C9gLOEK8p1HUM846A5op22Ylsikc/ACqPqzs+W8qwy4hlA6Rhv/6fVXgRB5x+YPAAA=",
//             "kinesisRecordMetadata": {
//                 "sequenceNumber": "49623566795604093650577098460464614514870532055362437122",
//                 "subsequenceNumber": 0,
//                 "partitionKey": "0998255e17c91d517269ab7b1e554151",
//                 "shardId": "shardId-000000000000",
//                 "approximateArrivalTimestamp": 1636837793882
//             }
//         },
//         {
//             "recordId": "49623566795604093650577098464872358053185470301219061762000000",
//             "approximateArrivalTimestamp": 1636837798528,
//             "data": "H4sIAAAAAAAAAI1TXW/aQBD8L/eMzZ3vwzZvFnGjSg2pgL6kjtBxvhhX/iB3BpQi/nvWZ4hAQmotJEuzszuzs/iIam2tLPTyY6vRBD0ky2T1lC4WyWOKRqg9NNoATEMcRpSzmNMY4KotHk2720JlnCzSZGzeq/FUN52RlbffKg+vuXxTWIs1pYTS9XpoWnRGyxq67nJWAQ4IPHQZEMxfVqWHiVBRHscc3rEUYQ5j7G5tlSm3Xdk238qq08aiyW90Vv/RFkXZFP/r6tXZSvdA6qccUZn32wqOgxAHlAeUEI55wAjBccCjGPpwzAIsGBUkCjkJCHAizgURGNx1JeTZyRqiIYKKiIZhxDDGo0vOMP6YoT24Bv8ZmmSI+AT3T4ZGGZJKtbumW5W5q13n7upGF5c+JT11Xo64Gqx46bu7rSO977T5WH3ZdOw+d4/Ar09+guMJYy9X5EbW2vGk1dKDvKRRm3Kvve0GEOwpefZBvKrYYPb2R+yqWvqW+tcefVnLv20jD9ZXbe1fu4H/nhNIrkBVSWsd+n02rK7afKDNntP5/Hk+BNbYA4SZ9dfL0DyXnXQcSz3jHf5pYHmRns6Sp9RB0xvh0+hmLA/8mPuECT+Kbgck95pfAbJGyTw3w62xT/wQLs6Yo0Nt25puuEIkGHco2G3sF/7r4eeFW+b9bDBUNnC9Rg3Kd74TkD6B+ukTHDEEnd8DAAA=",
//             "kinesisRecordMetadata": {
//                 "sequenceNumber": "49623566795604093650577098464872358053185470301219061762",
//                 "subsequenceNumber": 0,
//                 "partitionKey": "ffdd81f49617f56d494bc4238782796d",
//                 "shardId": "shardId-000000000000",
//                 "approximateArrivalTimestamp": 1636837798528
//             }
//         },
//         {
//             "recordId": "49623566795604093650577098465207230505218722651332149250000000",
//             "approximateArrivalTimestamp": 1636837799010,
//             "data": "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",
//             "kinesisRecordMetadata": {
//                 "sequenceNumber": "49623566795604093650577098465207230505218722651332149250",
//                 "subsequenceNumber": 0,
//                 "partitionKey": "f1e740bdd532273a02be1048ecca5b08",
//                 "shardId": "shardId-000000000000",
//                 "approximateArrivalTimestamp": 1636837799010
//             }
//         },
//         {
//             "recordId": "49623566795604093650577098470647396693484554349826801666000000",
//             "approximateArrivalTimestamp": 1636837804982,
//             "data": "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",
//             "kinesisRecordMetadata": {
//                 "sequenceNumber": "49623566795604093650577098470647396693484554349826801666",
//                 "subsequenceNumber": 0,
//                 "partitionKey": "0998255e17c91d517269ab7b1e554151",
//                 "shardId": "shardId-000000000000",
//                 "approximateArrivalTimestamp": 1636837804982
//             }
//         },
//         {
//             "recordId": "49623566795604093650577098481010308819221156253883432962000000",
//             "approximateArrivalTimestamp": 1636837814734,
//             "data": "H4sIAAAAAAAAAK2RW2/TQBCF/4pl8RiT3dnd8TpvbuMWRAJVbHhpIrSOp6klX4IvaUvV/84kFIGEkKhUafflzNHMN2ce/Zr63u0oe9iTP/PncRZ/XSZpGl8m/sRv7xrqWJZKGYwEGhUhy1W7u+zacc+Vqbvrp5Wr88JN4zSJg5TcnA7AX0ZCmsQEV7dBUuWLk+dibLZD2TbnbUe35IKy+vBuhLCK8LD92TgdOnI1dwYBcir5qen1m0WcJWm2kU6AzUWOApzOCxFFLkeiwjqrFCjiFv2Y99uu3B+nXJTVQF3vz679c2qGzlWLdrcrm91rUm9O2MmBBxwnPfplwfQKjYCQaZUBg1orQKGt1UqFQguttbGsSoUQRgDSKCmtFOaY7lDyTQZXc7wSFVoVWi4YnPy6FbdPs3iVeSv6NrL1fTHzcqPZpV1wY20YaHLbwEZOBkRSF6Fy4Y0A7wuHwWvMvOc8143/NPkbWGkmRtASLBiDMkKUAjkWGQKgDQExNMZI9oP8JzCKP4GTj/OX4r4CHfwn3Sq5+vTyPNfDfOzccEpUvhXKq/v1cFZWFRXe7wqc5CXVbffgpeV3YjNYb3nGorv3ngufe+KpJjrpx803Tz8AP9dJeZwDAAA=",
//             "kinesisRecordMetadata": {
//                 "sequenceNumber": "49623566795604093650577098481010308819221156253883432962",
//                 "subsequenceNumber": 0,
//                 "partitionKey": "89bff8ff75c8d895b8f6f20ee080f8d4",
//                 "shardId": "shardId-000000000000",
//                 "approximateArrivalTimestamp": 1636837814734
//             }
//         },
//         {
//             "recordId": "49623566795604093650577098481473327408133559296515375106000000",
//             "approximateArrivalTimestamp": 1636837815242,
//             "data": "H4sIAAAAAAAAAK2R3W/TMBTF/5Uo4rGh9nX81beMZhOwsqoJvKwVchK3C8pHsRPGmPa/cxuGACGQJs3Kg3Wudc7vntyHrfXeHGx+d7ThIlwmefJxlWZZcpGGs7C/7axDmXFBqIg1CA4oN/3hwvXjESdzc+vnjWmLysyTLE2itXV1awfrovWN8ZZFaVNcTvPzsSuHuu/WY9HU5dr11U109G9d9sk2q6s3+odxNjhrWnQGAnRO8WPz6xeXSZ5m+c6wqjSw5xWXJmamRFeuqsrCvmLKEIUWfix86erjKem8bhDEh4vr8JXtBmeay/5wqLvDc1LvJuz0Cwacku7Dujo1JjgBSUDFXAuiCNGcS8UoA0UBr0xzxkBLBhykJIzx01ExbjAgiR9Mi/VSwYRiUhFBmZj9/Fdon+XJJg829vOIT19Xi0CRvVa6iCOgpoxioWRkCiCR3kNh+d6WQpDgA5aBqyyCxz63Xfgw+wtYkImIaorJEtCLagWEQKyk1JRqqXisOIs1srF/A+vfgdN3y6fiPgPdf+r8g26Trq+e3ud2WI7ODFOj9CWhQeu3w1ndNLYKfk1gkle27d1dkNXfLD4GFazOUDRfg8fBe28xletJP22+e/gOHbVYs5wDAAA=",
//             "kinesisRecordMetadata": {
//                 "sequenceNumber": "49623566795604093650577098481473327408133559296515375106",
//                 "subsequenceNumber": 0,
//                 "partitionKey": "a5fe278dd50abfaceb08b15fa5eeac02",
//                 "shardId": "shardId-000000000000",
//                 "approximateArrivalTimestamp": 1636837815242
//             }
//         },
//         {
//             "recordId": "49623566795604093650577098483484979971972302380665405442000000",
//             "approximateArrivalTimestamp": 1636837816837,
//             "data": "H4sIAAAAAAAAAI1TXW/iMBD8L34mwY4Tx+YtornqpCs9AffSS4WM44ac8kHtAOoh/ns3DlQgId1FlizNzu7OzjpHVGtrZaGXH1uNJughWSarp3SxSB5TNELtodEGYBrjmNMoFBEVAFdt8Wja3RYi42SRJmPzXo2nuumMrLz9Vnl4Hck3hTVbU0ooXa+HpEVntKwh6y5nFeCAwEeXcOGXVelhwhTPhYjgFpLFOZSxu7VVptx2Zdt8K6tOG4smv9G5+4+2KMqm+F9Vr05WugdSX+WIyryflkU4iOFENA5CQTgnIWM4jKMIEywEC2goYsJFgDnnWHAiACQM1HUl+NnJGqwhjDJOY44DjPHo4jOUP2ZoD6pBf4YmGSI+wf2XoVGGpFLtrulWZe5i1767uNHFJU9JT52HIy4GI17y7k7rSO87bT5WXzIdu/fdI3B65ycET3DwckVuZK0dT1otPfBLGrUp99rbbgDBnpJnHcSrig0O3/6wXVVL31L/WqMva/m3beTB+qqt/Ws18PZcg+QKVJW01qHfZ8Poqs0H2uw5nc+f54NhjT2AmVm/vQzNc9lJx7HUM97hnwKWl9bTWfKUOmh60/g0uikbBb6IfHgOPqHstkJyL/sVIGuUzHMzLBv7xI9h5WHo6BDbtqYb1sBZGDkU9Db2C//18PPCLfO+NigqG1hfo4bOd34UaH2C7qdPPXJMOeADAAA=",
//             "kinesisRecordMetadata": {
//                 "sequenceNumber": "49623566795604093650577098483484979971972302380665405442",
//                 "subsequenceNumber": 0,
//                 "partitionKey": "17b47d15dc8a2ad561dd9ab0c5d7120f",
//                 "shardId": "shardId-000000000000",
//                 "approximateArrivalTimestamp": 1636837816837
//             }
//         },
//         {
//             "recordId": "49623566795604093650577098484036250145716573284331421698000000",
//             "approximateArrivalTimestamp": 1636837817720,
//             "data": "H4sIAAAAAAAAAK2T226bQBCGXwWhXoZ6j7OzviM1iSI5rWVobpKoAnZNkcCkgHNU3r0TN1UbNYkcNdKCYGY1882//96FrR+GvPLZzYUPp+EszuJvx0maxodJuBd2V2vfU1hqYByUFaAFhZuuOuy7zQVlJvnVMGnytnD5JE6TOFr4vm796Pto8T0fvIySpphv8webdTnW3XqxKZq6nPnLzEfd9fwGj06uvKuqX4XTsfd5S5UFE3zCacnJ6Yd5nCVpds5WLvdCW6XUSnkDRSmlKpQqndZACSoxbIqh7OuLh04HdUMgQzg9DT/59djnzbyrqnpdvSf1+RY7uaQGD53uwto9KAaaCcOEZRxpAVhJ3xK55MCtQRT0y5gBwRGZAi7BGKaBJhiJZBjzluTlIAGlQYag2N7vs6LyaRYvs2Dpf2xo65GbBhycQSF5ZPRKR2plRGSdK6LSmdxyjiU3OjghMWiUafCo59k6vN97BliBAlRCSsbQKMVQAEerpATC1VxrQdwaCAzty8Dib+Dk8+ytuP9PZ9mOdMtk8eXtep6Ns02fj1tF+UeOQTucjft103gX/MmIbfjYt11/E6T1rafNAoPjfQrm18Fj4uvgqau22/izk1smAC0hSa2MMlbThVSaM24EGjCCsmiRxrNopOTPT84FMPOqkQqdK8vQRSSRjZRgRYRQYMS4dKzUzrjC72YksrvUKLQ0nBmyPj300iDo9grqIbi0SFu0FajxhaMiYM5eMdIuuO9A97KcT+n+NdJOgE+MxOS7Gun8/icfLKws5QUAAA==",
//             "kinesisRecordMetadata": {
//                 "sequenceNumber": "49623566795604093650577098484036250145716573284331421698",
//                 "subsequenceNumber": 0,
//                 "partitionKey": "2d4aa4d1697b441bd00582e2949e8129",
//                 "shardId": "shardId-000000000000",
//                 "approximateArrivalTimestamp": 1636837817720
//             }
//         },
//         {
//             "recordId": "49623566795604093650577098492213424389589925503080333314000000",
//             "approximateArrivalTimestamp": 1636837823787,
//             "data": "H4sIAAAAAAAAAK2Sa2vbMBSG/4ox+xjP0tE939zG7caSrcTevjRhSPFpavAl8yVtV/rfp3gdG4zBCgUJxHsO5330So9hjX1v95g/HDCch4skT76u0ixLLtNwFrZ3DXZepowJaYgUzEgvV+3+smvHg6/E9q6PK1u7wsZJliZRhnaBR/CbGkJFKqKr2yit3HLquRib3VC2zXnb4S3aqKw+vBtBVUYedz8HZ0OHtvaTgQCNqV8svn6zTPI0y7fUEtCOOEnAclcQY6yTiIW2mjFg6Ef0o+t3XXk4uVyU1YBdH86vw3Nshs5Wy3a/L5v9a1JvJ+z06A1OTo9hWXh6JgUBRRhhkitJpKJaakaASwaUgCQCjKSKSa00GGWYVgCantIdSv8mg619vFT6BqY05VKZ2a+38uOzPFnnwRq/jb71fTEPHHOM70BFBgsVcXNDIiuNiAggde7Gaacw+OLD8NeYB895bprwafY3sJDCn6hUErj315QJA9QIzbgGxRVV3P8DkJxzTf8JrNmfwOnHxUtxX4EO/pNunV59enmem2ExdnaYEqVviQjqfjOclVWFRfC7ApO8wrrtHoKs/I6+GXSwOvOivQ+eC5979K7CTPrp5tunH1nTHyecAwAA",
//             "kinesisRecordMetadata": {
//                 "sequenceNumber": "49623566795604093650577098492213424389589925503080333314",
//                 "subsequenceNumber": 0,
//                 "partitionKey": "89bff8ff75c8d895b8f6f20ee080f8d4",
//                 "shardId": "shardId-000000000000",
//                 "approximateArrivalTimestamp": 1636837823787
//             }
//         },
//         {
//             "recordId": "49623566795604093650577098494412460455468936040590344194000000",
//             "approximateArrivalTimestamp": 1636837825611,
//             "data": "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",
//             "kinesisRecordMetadata": {
//                 "sequenceNumber": "49623566795604093650577098494412460455468936040590344194",
//                 "subsequenceNumber": 0,
//                 "partitionKey": "0998255e17c91d517269ab7b1e554151",
//                 "shardId": "shardId-000000000000",
//                 "approximateArrivalTimestamp": 1636837825611
//             }
//         },
//         {
//             "recordId": "49623566795604093650577098495466643770172892818373083138000000",
//             "approximateArrivalTimestamp": 1636837827869,
//             "data": "H4sIAAAAAAAAAI1T74+iMBD9X/pZcEoBqd+Iy20uuXUv6n3ZY2NKqciFX9uiZs/4v+8AajQxuWsgJG/ezLx5HY6kVMaITK0+G0Wm5ClcheuXaLkMnyMyIvWhUhphNoFJwDyXe4wjXNTZs653DUbG4TIKx/qjGM9U1WpRWPtGWpB4YiNB+QljlLEkGZKWrVaixKyHnLUDDsXDVviBt3VugctV4jmOhIQHGyW6MmaXGKnzps3r6ltetEobMv1Nzt1/1FmWV9n/qnrvZUV7JHVVjiRPu2l9D5wJMPA9zjzmUY+7EHDKORrAfeB+AAzdoAF1KZu4wKjrOy6gujZHP1tRojXUZ37AJgH1AWB08RnLH2OyR9WoPybTmFCbQndiMoqJkLLeVe06T/vYre99XKvskieFJc/D0T6GI17yHk7bkz52Sn+urzJ7due7RfHpnJ9SQOlvN+RKlKrnCaOEhX4JLbf5XlnNFhGwpDjroFaRbcHd/PF3RSlsw+xbjbYoxd+6Egdjy7q0b9Xg7vUNwhtQFsKYHv0+H0aXdTrQ5q/RYvG6GAyrzAHNjLvbi8kiFa3oOYZZ2jr8U8Dq0no2D1+iHprdNT6N7sp6js09m7rd695XCB9lvyNktBRpqofLBpvaE3rNxlhT63aI4bIMW4B6K3PFfz39vHDztKuNivIKr6+SQ+cHPwq2PmH30xcDMtSh4AMAAA==",
//             "kinesisRecordMetadata": {
//                 "sequenceNumber": "49623566795604093650577098495466643770172892818373083138",
//                 "subsequenceNumber": 0,
//                 "partitionKey": "1fc3612340c22368ffc85e169ba9cc68",
//                 "shardId": "shardId-000000000000",
//                 "approximateArrivalTimestamp": 1636837827869
//             }
//         },
//         {
//             "recordId": "49623566795604093650577098495600834536150116725484945410000000",
//             "approximateArrivalTimestamp": 1636837828197,
//             "data": "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",
//             "kinesisRecordMetadata": {
//                 "sequenceNumber": "49623566795604093650577098495600834536150116725484945410",
//                 "subsequenceNumber": 0,
//                 "partitionKey": "417e9d093b8efde41c4c3cee2f7d094d",
//                 "shardId": "shardId-000000000000",
//                 "approximateArrivalTimestamp": 1636837828197
//             }
//         },
//         {
//             "recordId": "49623566795604093650577098495750741337782330743148511234000000",
//             "approximateArrivalTimestamp": 1636837828585,
//             "data": "H4sIAAAAAAAAAK2R3W/TMBTF/5Uo4rGhjq8/+5bRbAJaVjWBl3VCbux2QfkodsI2pv3v3JYhkBASE0h5sM+xzv3dk4e4dSGYvSvvDy6exfOszD4u86LILvJ4Eve3nfMoAxckFUxTwSnKTb+/8P14QGdqbsO0Me3WmmlW5Fmycr5u3eB8sroxwUGSN9vFyT8fu2qo+241bpu6Wvne3iSH8NYXn1yzvHyjvwcXg3emxWRKaDpN8YPp1YtFVuZFeW3AVobuuOXSMDAVpnJlraM7C8oQhRFh3IbK14fjpPO6QZAQz67iV64bvGkW/X5fd/v/SX19ws6/4IDjpIe4tsfGBCdUEkgZKCkY9ieo5iCpBLzqlEipNJYqCQGNZ2yXKCIYbjAgSRhMi/WmAoQCdDXTfPLjX2F8UWbrMlq7zyM+fW1nkTKVUtSIBDRAwoTbJcoqk1CngVrmnLAQfcAycJVZ9NTnposfJ78Da8EF14SBZFIxrYQmXFJKpDhycy0ZBcUIUC2p/jOw/hU4fzd/Lu6/0wH5S7p1vrp8fp+bYT56M5waJS81jdqwGc7qpnE2+umkJ3np2t7fR0X91aFEVbQ8Q9HcRU/G++BwKtcn/bj59eM3b1kjUJwDAAA=",
//             "kinesisRecordMetadata": {
//                 "sequenceNumber": "49623566795604093650577098495750741337782330743148511234",
//                 "subsequenceNumber": 0,
//                 "partitionKey": "a5fe278dd50abfaceb08b15fa5eeac02",
//                 "shardId": "shardId-000000000000",
//                 "approximateArrivalTimestamp": 1636837828585
//             }
//         },
//         {
//             "recordId": "49623566795604093650577098495980437243509110355062161410000000",
//             "approximateArrivalTimestamp": 1636837828992,
//             "data": "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",
//             "kinesisRecordMetadata": {
//                 "sequenceNumber": "49623566795604093650577098495980437243509110355062161410",
//                 "subsequenceNumber": 0,
//                 "partitionKey": "638ee869225953d6e708f92a22171c1e",
//                 "shardId": "shardId-000000000000",
//                 "approximateArrivalTimestamp": 1636837828992
//             }
//         },
//         {
//             "recordId": "49623566795604093650577098503264215306687251407544778754000000",
//             "approximateArrivalTimestamp": 1636837833358,
//             "data": "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",
//             "kinesisRecordMetadata": {
//                 "sequenceNumber": "49623566795604093650577098503264215306687251407544778754",
//                 "subsequenceNumber": 0,
//                 "partitionKey": "a5de4b9f869a3ed1304198c5366b2836",
//                 "shardId": "shardId-000000000000",
//                 "approximateArrivalTimestamp": 1636837833358
//             }
//         },
//         {
//             "recordId": "49623566795604093650577098505935941368035582021084381186000000",
//             "approximateArrivalTimestamp": 1636837835270,
//             "data": "H4sIAAAAAAAAAI1TXW/iMBD8L34mwR9xEvMW0Vx10pWegHvppULGcUNO+aB2APUQ/70bByqQkO6sSJFmZ3dmx8kR1dpaWejlx1ajCXpIlsnqKV0skscUjVB7aLQBmEU4ihkPBGcC4KotHk2720JlnCzSZGzeq/FUN52RlbffKg+vuXxTWIdrxghj6/XQtOiMljV03eWsKKYEDlvCC7+sSg+HcUgUppzmLCKhoDDG7tZWmXLblW3zraw6bSya/EZn9R9tUZRN8b+uXp2tdA+kfsoRlXm/bcgxjTBwaMwiHkckFmFMwI2gIogpIzTiJO7dMRExHAcE05CH4K4rIc9O1hANCVkI7TERGOPRJWcYf8zQHlyD/wxNMkR8gvuToVGGpFLtrulWZe5q17m7utHFpU9JT52XI64GK1767m7rSO87bT5WXzYdu8/dI/D0yU8InhDxckVuZK0dT1otPchLGrUp99rbbgDBnpJnH8Srig0O3v6Eu6qWvmX+tUdf1vJv28iD9VVb+9du4NtzAskVqCpprUO/z4bVVZsPtNlzOp8/z4fAGnuAMLP+9jI0z2UnHccyz3iHfxpYXqSns+QpddD0Rvg0uhnLqS+4TwLui/B2QHKv+RUga5TMczPcNfaJH8GNB4GjQ23bmm6ocUFih4Ldxn7hvx5+Xrhl3s8GQ2UDt9eoQfnOfwLSJ1A/fQI7nQAd3wMAAA==",
//             "kinesisRecordMetadata": {
//                 "sequenceNumber": "49623566795604093650577098505935941368035582021084381186",
//                 "subsequenceNumber": 0,
//                 "partitionKey": "bfbc2e7f2b2a33bc098c6b432b4b80a5",
//                 "shardId": "shardId-000000000000",
//                 "approximateArrivalTimestamp": 1636837835270
//             }
//         },
//         {
//             "recordId": "49623566795604093650577098508490401624881293604677484546000000",
//             "approximateArrivalTimestamp": 1636837837705,
//             "data": "H4sIAAAAAAAAAK1Ta2vbQBD8K4copIUo3nvf+ZvSOMHQPOWm0NiUk3RyRPRwJTlpGvLfu3ZTmkJMY1p06GB32Zmd2XsIKt91bu4n9wsfDIODaBJ9OR7FcXQ0CnaD5q72LYa5VECVsExJhuGymR+1zXKBmYG76walq5LMDaJ4FIVnvi0q3/s2PLt2nafh5SL9HXRlMl4cNu2da7OinofXuRfz9PxG7Z+rn43jvvWuws4MGB1QPHxw9eZDNBnFk5nOcpM5oFkijbBKuiz3iMxlYmimJMUW3TLp0rZY9EVTHxYlYnbB8Cp47+se0T808zni/k/WszXt0S0CrJAegiJbKaYkMA2cC82ZolJIsFQYBYyD1oIz0JRLDlYqioVa4E21XonQI2jXuwrlpYorw7VhRlGz+8srbB9PoosJufBfl1g6zoaEJlYwRyHMde5CYZwLrdQsTHOV5yJlFmxKLlEMlGVInvSc1sHj7guENWgprbXIWikupQCmmDZSUyMFXlpiAX5Mgd1ImMFzwis3Q4qHTxgdUhgys4cln6f9a5hP+/HJ4em0j1NX1+gAwe3rPSmb5ma5IL1LSk/WPkZlEo4X4TOvbtFIEIKl2uc5ZJpzn8HLg1sw2lLOtTWcSUYll5YJyYzRxgj8UWkUagBKKME2Dm71Xwe3asvBr6JPMcnua1c1WUIYAIE90KojQFrft4XvZqRDcd4+kMlKjRNX+SHZ2UaTHfL4boMuFFeUCsokcAorYSwohSpIqykmmLXCMCYAl1xuXgj7xwaPTg623d9/Z6fglewuRmen2z+waX+wbF2/fmJa7xkgVTft94uy9Bl5ljLr+LGvmvaexMV3tIoyQ473Mei+kafEx86vcBlbJ1bDzx5/AEHS8USwBQAA",
//             "kinesisRecordMetadata": {
//                 "sequenceNumber": "49623566795604093650577098508490401624881293604677484546",
//                 "subsequenceNumber": 0,
//                 "partitionKey": "1856842dc4642e41b8eb6849f2889ad0",
//                 "shardId": "shardId-000000000000",
//                 "approximateArrivalTimestamp": 1636837837705
//             }
//         },
//         {
//             "recordId": "49623566795604093650577098522160934793083521136888643586000000",
//             "approximateArrivalTimestamp": 1636837849789,
//             "data": "H4sIAAAAAAAAAK2R227TQBCGX8WyuIzJ7s4ec+c2bkEkUMUuN02E1vYmteRD8CGlVH13xqaoIARSpWp3b/6Znfnmnwe/cl1nDy65Pzp/4S/DJPyyjuI4vIz8md/c1a5FmQIIaYgUYCTKZXO4bJvhiJG5vevmpa3S3M7DOAqD2NmlOzF81BAqIhFc3QZRma6mnIuhzvqiqc+b1t06GxTlh3cDU6WRp+xn4bhvna2wMiOMzilemN+8WYVJFCc7agnTKUklYZanOTHGptK5XFsNwMBhiW5Iu6wtjmOXi6LsXdv5ixv/3NV9a8tVczgU9eE1qXcTdnTCBmOnB7/IkR6kIEwRkHQ6oLRSHASTnBkQnBglBKpSKK21BK0NVyBgdLcvcCe9rdBe/Cg1/uVEKpj92hWWj5Nwk3gb93XA1Pf5whMcYK9yCDJC0oDnxAaGpzJgRKV7bYBne+t9RjNwjIX35Oe29h9nfwMzppGQUiBAtBgFI4XQTFEtkAbAcCRSnHKlxb+B5e/A0cflS3Ffge4/dv5Bt4muPr3cz22/HFrbT47St5R6Vbftz4qydLn3HGGTvHZV0957cfHdYTLT3voMRfvNewpcd27saiZ9nHz3+APQrwRMnAMAAA==",
//             "kinesisRecordMetadata": {
//                 "sequenceNumber": "49623566795604093650577098522160934793083521136888643586",
//                 "subsequenceNumber": 0,
//                 "partitionKey": "89bff8ff75c8d895b8f6f20ee080f8d4",
//                 "shardId": "shardId-000000000000",
//                 "approximateArrivalTimestamp": 1636837849789
//             }
//         },
//         {
//             "recordId": "49623566795604093650577098522507896503312919778748792834000000",
//             "approximateArrivalTimestamp": 1636837850254,
//             "data": "H4sIAAAAAAAAAK2Sa2/TMBSG/0oU8bGhvl/6LaPZBLSsagJf1gq5sdsF5VLshG1M+++cdEOAEEgTRFZkvcd6z3Ne+z5uXAjm4Iq7o4tn8Twt0o/LLM/TiyyexN1N6zzIlAuEBdNEcAJy3R0ufDccoTI1N2Fam2ZnzTTNszRZOV81rnc+WV2b4GiS1bvFqX4+tGVfde1q2NVVufKdvU6O4a3PP7l6eflGPxrnvXemAWeCCJ5iWHR69WKRFllebA21pSF7brk0jJoSXLmy1pG9pcogBRZh2IXSV8ex03lVA0iIZ1fxK9f23tSL7nCo2sP/pN6esLMv0GDsdB9XdkxMcEQkooIIwYhWChMkGRNcYokEVuLxTwmHTLnClFDENUEwQQ8koTcNxIsFFYpKxTBmdPL9rsA+L9J1Ea3d5wGOvraziNO9wAKJRBi8S5hkOjHI7hMLydCSauwYij5AGDDKLHrKc9PGD5PfgSXSSiO4c8oQYRoxhBglEj7KOGISXgIZT487/Wdg8TNw9m7+XNx/p5N/ifMXunW2unx+npt+PnjTnxJFL7WMmrDpz6q6djb6UcEneemazt9FefXVgURUtDwD0dxGT4X3wY1d9UkfJ98+fANs/njvnAMAAA==",
//             "kinesisRecordMetadata": {
//                 "sequenceNumber": "49623566795604093650577098522507896503312919778748792834",
//                 "subsequenceNumber": 0,
//                 "partitionKey": "a5fe278dd50abfaceb08b15fa5eeac02",
//                 "shardId": "shardId-000000000000",
//                 "approximateArrivalTimestamp": 1636837850254
//             }
//         },
//         {
//             "recordId": "49623566795604093650577098523963443190128933373814505474000000",
//             "approximateArrivalTimestamp": 1636837851625,
//             "data": "H4sIAAAAAAAAAO1YW0/bSBT+K1a0b4vJXD0zfkubtGK3XBan7aoJssb2JLg4duoLFCr++x7bgTpA2rBFq20FCQqc25zr5zP50luYotBzM75cmp7bGw7GA39/5HmD16PeTi+7SE0OZEYkp4Q5SCIC5CSbv86zagmcvr4o+oleBJHuD7zRwD5cmlyXcZYW9tGpLgy1azJQU8/oPDz1YrM4yrMQjh2d2/Io/PuPq4vgwgwvW8NemRu9AMsEEdzH8Kb9yW9vBuORNz7hIlKODg2K9IwpRwRaMIcFDpdKM8ElmCiqoAjzeFm78CpOSpMXPXfSe2nSMtfJm2w+j9P5U3p90rg9OocD6pO+9OIIvKcOR0Qg+HCUYhQRSrliTFJOHKEQJ0QyygWhUkJuMVNcUuEoByIoY6hJqReQXuxQB+iSEY7Yzk2twLw3HhyPrWPzqQLRvci1MAkjIWaOHaogsplAga2ZDG1CA6IlCiBV2noHyYAYXWuVz2nau96557BA4CXiFDuCSsWFcBATmMIbSYkZEw5RgmP4VdTBmx2WXYe/THuJOTfJtOdOe3sHrw6nvZ3pDR+IwF8U85abnmdnJrJMYSeZjkzeiBbUD6rwzJSNDJRIA3de1yY+N/ayLhqyQ+iNps7YTuaniM0+OlWy0DcGzsxlo53ZZSDzT9qcc9wfvPegK4r+GpEKJCALUBaq+i+TrIrGuY4TexjPIdT+wthFVpWnNu532rSr5N9T8r8q+W3P5XO7EfBDba/8Bl5tEH7oGP6AInzY/Vhk6e78qgkCQi5hUpsoqvQshQFtgyt1XvpptQjqdLkISCaNOoTrRjlserzR9v04jUvfdxltLNwWseHWTtgY3tQi2MXIZWQHKvo7gp/2QJOfx2HrSLZWqDBLIr/xB5gznRQGiLMqDeuj/VQvWqUfHLvmqFurC7PI8ku/iK/Myn0m1yV03oYNny4Mv9sOv9vNvNtFOfdG031SR/N2Yv04arzZZmp/neb9nOtLHwRDcxu/7WCFiIqIzSMijYw4CWeYCGooj9TMMVDG6w0whRGXyEFggQomJZWARkQhUfOlwFBIDra5oEoIuRmm1EaYej84Ptg7eH0HqaY97yxeLgGgPGplwUcTllZgQl0VxlqNpAVjatVzasVpLQWl27F+3rqt4UY7OP6pTqPE5C5R8hk+nuHjF4cPtSV8jA6Gj13Kftw7ibb07nh0dPj4rXFaDqu2eUF+VzJrUUzLF3GSAAJ+5ZCGvN8MkuXBIAEJpsjafwFU/dlacd4WBo5VvKE/FLrESEmkmFAUCyWFrLNAEGyaFMNeCsMFFQdRBalBWG5aPxVbD/3eviwVNZpzZjPJpc0IjGSgiLAdxRUJooAGRmy1L0uMoQ7Q+IwQDFs8UxQ5TBFGGWesdhPDCk1pXSzwmG10GOOfeF9mEl5EEkoc2sGMflXYFxDrOlZ0hTtY4d8Kd3AAsvvBf7d3MTxDxSj+86/iytPLjStxWBsra2P/0VasdqBuz4+1p32sbTObP1WLfuPJpWweIOUwygmVKGJqJnjExYyyDU8uialyAF5gp5UMEFBhDhAj6q8QKHfgvl5/36AAMbGSkC6xCW84o4/BG2jNJKn32sK6MLmxmtaOYL8tM2uw0FdZao28726LFG+3LaodzsjzWD2P1f91rDbdJx8YKx86oH1gjztd39UgEEuTjPe6DE/3TZnHYa0yAZ0DaOFiqVfN7+2N9pvQh2AqrXeTRm7SeQp2x+XkBP67b2+1NSyrEsr5Kk6M17QyyL6Fh1/DfXFZGlCBNHVUDqsSdIa61FsqeFVYNymc8gZG9mVWpeW61oq0rjXK8yx/pM44K3Vys43WeV7X2Yd1NS5MmKXRPSdHxTFkGDJpHqfXHLlK4KPcBJ1vyJ/A6ztbzUY0/FkG937vuRNKsbOL6oa922buhBO4/LTMB1vKnWDash/oHXeCWt4DPQKKDK8077SBO5EdtfU6g9o6b92PpwCYTTfOuwBz58a5Fcb/sHd0043zrnf3b5xbOdi9cVKyK52H75yY0n956zy5/gcikQt5+RoAAA==",
//             "kinesisRecordMetadata": {
//                 "sequenceNumber": "49623566795604093650577098523963443190128933373814505474",
//                 "subsequenceNumber": 0,
//                 "partitionKey": "638ee869225953d6e708f92a22171c1e",
//                 "shardId": "shardId-000000000000",
//                 "approximateArrivalTimestamp": 1636837851625
//             }
//         },
//         {
//             "recordId": "49623566795604093650577098524674291572062335397261213698000000",
//             "approximateArrivalTimestamp": 1636837852739,
//             "data": "H4sIAAAAAAAAAK2TW2+bQBCF/wpCfQz17O7szW+kJlEkp7UCzUsSVQusKRKYFHAujfLfO3ZTtVGayJGMeDozmvnmcHgIWz8MrvLZ/bUPp+EszuJvp0maxsdJeBB2tyvfkyykAqbQciU5yU1XHffd+poqE3c7TBrX5qWbxGkSRwvf160ffR8tvrvBiyhp8vm2frReFWPdrRbrvKmLmb/JfNTdze/NyfmtL6vq9+B07L1raTIHziaMXjG5+DCPsyTNrmBZOs+lRcQleq3yQgjMEYtSSkUFGjGs86Ho6+vNpqO6IZAhnF6En/xq7F0z76qqXlX7pL7aYic3tGCz6SGsy41jSgLXIJQRoITRArUggQmhOdMKBUiBhmnJwRhQyECjtoB0wUgkw+haspepzQBtUCgtDv58KxqfZvFZFpz5H2tqPSmngbKFKMqljYDWRWh8Hpmi4BGiLA0WTLHlMjgnM+iUafDk5+UqfDx4CcwEaC01GMW55lJaxoyxjFODtYJJYSxYbhRpUrwOrP4FTj7P3ou7B7o37HxGd5Ysvrzfz8txtu7duHWUfQQbtMPleFg3jS+DvxW+lU992/X3QVr/9NTMTXB6SKK7C54KXwdPW6Xd6v+7XFN2NBpOAJYyg8AEGYBSo9WgyQzNqQmALLCSK/3K5VqJt4PExNKROyrKGUKEFmTktIRIQ06+08Md2ylIBIzM4uZvtQokKq7ASG4MZ4z+XzDA9IYWJJOKAbwOLN8I0i64e6BjO9K9DNJOgM+CxHCvQbp6/AV4dJU95QUAAA==",
//             "kinesisRecordMetadata": {
//                 "sequenceNumber": "49623566795604093650577098524674291572062335397261213698",
//                 "subsequenceNumber": 0,
//                 "partitionKey": "2d4aa4d1697b441bd00582e2949e8129",
//                 "shardId": "shardId-000000000000",
//                 "approximateArrivalTimestamp": 1636837852739
//             }
//         }
//     ]
// }, {});
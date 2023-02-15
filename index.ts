import fs from "fs";
import axios from "axios";
import { JSDOM } from "jsdom";

type MethodParam = {
  type: string;
  required: boolean;
  fields?: Array<{
    name: string;
    type: string;
    required: boolean;
  }>;
};

function removeAt(index: number, s: string) {
  return s.substring(0, index) + s.substring(index + 1);
}

async function fetchPage(url: string) {
  try {
    const response = await axios.get(url);
    const dom = new JSDOM(response.data);
    return dom.window.document;
  } catch (error) {
    console.error(error);
  }
}

enum MethodCategory {
  Accounts = "Accounts",
  Transaction = "Transaction",
  Block = "Block",
  Inflation = "Inflation",
  Slot = "Slot",
  Stake = "Stake",
  Epoch = "Epoch",
  Fee = "Fee",
  Token = "Token",
  Miscellaneous = "Miscellaneous",
}

function getCategory(m: string) {
  const methodName = m.toLowerCase();
  if (methodName.includes("block")) {
    return MethodCategory.Block;
  }
  if (methodName.includes("slot")) {
    return MethodCategory.Slot;
  }
  if (methodName.includes("epoch")) {
    return MethodCategory.Epoch;
  }
  if (methodName.includes("stake")) {
    return MethodCategory.Stake;
  }
  if (methodName.includes("inflation")) {
    return MethodCategory.Inflation;
  }
  if (methodName.includes("fee")) {
    return MethodCategory.Fee;
  }
  if (methodName.includes("token")) {
    return MethodCategory.Token;
  }
  if (methodName.includes("transaction")) {
    return MethodCategory.Transaction;
  }
  if (methodName.includes("account")) {
    return MethodCategory.Accounts;
  }
  return MethodCategory.Miscellaneous;
}

async function main() {
  const document = await fetchPage("https://docs.solana.com/api/http");
  if (!document) {
    return;
  }

  const methodSections = document.getElementsByClassName("DocBlock_boPv");

  const categoryNameMap: { [key: string]: Array<string> } = {};
  const categoryMap: { [key: string]: Array<any> } = {};

  const methods = Array<any>();

  for (const methodSection of methodSections) {
    const methodName = methodSection
      .getElementsByTagName("h2")[0]
      .textContent?.replace(/[\u0000-\u001F\u007F-\u009F-\u200B]/g, "");
    const category = getCategory(methodName!);

    const methodDescription =
      methodSection.getElementsByTagName("p")[0].textContent;

    const deprecated =
      methodSection
        .getElementsByClassName("theme-admonition-warning")[0]
        ?.textContent?.toLowerCase()
        .includes("deprecated") ?? false;

    const paramsSection = methodSection
      .getElementsByClassName("CodeParams_B82f")[0]
      .getElementsByClassName("Parameter_p8dk");

    if (!paramsSection) {
      console.log("Params section not found for method: " + methodName);
      continue;
    }

    const params = Array<MethodParam>();

    for (const param of paramsSection) {
      const type = param
        .getElementsByClassName("ParameterHeader_UUsJ")[0]
        .getElementsByTagName("code")[0]
        .textContent?.trim()
        .replace(/[\u0000-\u001F\u007F-\u009F-\u200B]/g, "");

      const fields = Array<{
        name: string;
        type: string;
        required: boolean;
      }>();

      try {
        if (type === "object") {
          const fieldSections = param.getElementsByClassName("Field_MIDZ");
          for (const fieldSection of fieldSections) {
            const name = fieldSection
              .getElementsByClassName("ParameterName_c9Z4")[0]
              .textContent?.replace(/[\u0000-\u001F\u007F-\u009F-\u200B]/g, "");
            const type =
              fieldSection.getElementsByTagName("code")[0].textContent;

            const flags = fieldSection.getElementsByClassName("FlagItem_qZK_");
            const required =
              flags.length > 0 && flags[0].textContent === "required";

            if (!name || !type) {
              console.log("Name or type not found for method: " + methodName);
              continue;
            }

            fields.push({
              name,
              type,
              required,
            });
          }
        }
      } catch (e) {
        console.error("Error parsing fields for method: " + methodName);
      }

      const required =
        param.getElementsByClassName("FlagItem_qZK_")[0].textContent ===
        "required";

      if (!type) {
        console.log("Type not found for method: " + methodName);
        continue;
      }

      params.push({
        type,
        required,
        fields,
      });
    }

    const codeBlockSections = methodSection
      .getElementsByClassName("CodeSnippets_vVvq")[0]
      .getElementsByClassName("codeBlockLines_e6Vv");

    const sampleRequest = codeBlockSections[0].textContent?.replace(
      /[\u0000-\u001F\u007F-\u009F-\u200B]/g,
      ""
    );
    const sampleResponse = codeBlockSections[1].textContent?.replace(
      /[\u0000-\u001F\u007F-\u009F-\u200B]/g,
      ""
    );

    if (!sampleRequest || !sampleResponse) {
      console.log(
        "Sample request/response not found for method: " + methodName
      );
      continue;
    }

    const startIndex = sampleRequest.indexOf("{");
    let requestJson = sampleRequest
      .slice(startIndex, -1)
      .trim()
      .replace(/\s/g, "");
    let responseJson = sampleResponse;

    if (requestJson.includes("simulateTransaction")) {
      requestJson = removeAt(requestJson.length - 4, requestJson);
    }

    try {
      const sampleRequestJson = JSON.parse(requestJson);
      const sampleResponseJson = JSON.parse(responseJson);
      const method = {
        name: methodName,
        description: methodDescription,
        params,
        sampleBody: {
          params: sampleRequestJson.params,
        },
        sampleResponse: sampleResponseJson,
        category,
        deprecated,
      };

      if (categoryMap[category]) {
        categoryNameMap[category].push(methodName!);
        categoryMap[category].push(method);
      } else {
        categoryNameMap[category] = [methodName!];
        categoryMap[category] = [method];
      }
      methods.push(method);
    } catch (e) {
      console.log(requestJson, responseJson);
    }
  }

  try {
    fs.mkdirSync("./.rpc");
  } catch (e) {}

  const now = new Date()
    .toISOString()
    .replace(/T.*/, "")
    .split("-")
    .reverse()
    .join("-");

  fs.writeFileSync(`./.rpc/methods.json`, JSON.stringify(methods, null, 2));

  fs.writeFileSync(
    `./.rpc/categorized-method.json`,
    JSON.stringify(categoryMap, null, 2)
  );

  fs.writeFileSync(
    `./.rpc/category-name-map.json`,
    JSON.stringify(categoryNameMap, null, 2)
  );

  console.log("Found " + methods.length + " methods");
}

async function runMain() {
  try {
    await main();
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

runMain();

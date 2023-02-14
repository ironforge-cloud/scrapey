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
  Program = "Program",
  Token = "Token",
  Account = "Account",
  Transaction = "Transaction",
  Block = "Block",
  Epoch = "Epoch",
  Fees = "Fee",
  Misc = "Miscellaneous",
}

function getCategory(methodName: string) {
  if (methodName.toLowerCase().includes("block")) {
    return MethodCategory.Block;
  }
  if (methodName.toLowerCase().includes("epoch")) {
    return MethodCategory.Epoch;
  }
  if (methodName.toLowerCase().includes("fee")) {
    return MethodCategory.Fees;
  }
  if (methodName.toLowerCase().includes("transaction")) {
    return MethodCategory.Transaction;
  }
  if (methodName.toLowerCase().includes("program")) {
    return MethodCategory.Program;
  }
  if (methodName.toLowerCase().includes("token")) {
    return MethodCategory.Token;
  }
  if (methodName.toLowerCase().includes("account")) {
    return MethodCategory.Account;
  }
  return MethodCategory.Misc;
}

async function main() {
  const document = await fetchPage("https://docs.solana.com/api/http");
  if (!document) {
    return;
  }

  const methodSections = document.getElementsByClassName("DocBlock_boPv");

  const categoryMap: { [key: string]: Array<any> } = {};

  const methods = Array<any>();

  for (const methodSection of methodSections) {
    const methodName = methodSection
      .getElementsByTagName("h2")[0]
      .textContent?.replace(/[\u0000-\u001F\u007F-\u009F-\u200B]/g, "");
    const category = getCategory(methodName!);

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

    const sampleRequest = methodSection
      .getElementsByClassName("CodeSnippets_vVvq")[0]
      .getElementsByClassName("codeBlockLines_e6Vv")[0]
      .textContent?.replace(/[\u0000-\u001F\u007F-\u009F-\u200B]/g, "");
    if (!sampleRequest) {
      console.log("Sample request not found for method: " + methodName);
      continue;
    }

    const startIndex = sampleRequest.indexOf("{");
    let jsonString = sampleRequest
      .slice(startIndex, -1)
      .trim()
      .replace(/\s/g, "");

    if (jsonString.includes("simulateTransaction")) {
      jsonString = removeAt(jsonString.length - 4, jsonString);
    }

    try {
      const sampleRequestJson = JSON.parse(jsonString);
      const method = {
        name: methodName,
        params,
        sampleBody: {
          params: sampleRequestJson.params,
        },
        category,
        deprecated,
      };

      if (categoryMap[category]) {
        categoryMap[category].push(method);
      } else {
        categoryMap[category] = [method];
      }
      methods.push(method);
    } catch (e) {
      console.log(jsonString);
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

  fs.writeFileSync(
    `./.rpc/methods-${now}.json`,
    JSON.stringify(methods, null, 2)
  );

  fs.writeFileSync(
    `./.rpc/categories-${now}.json`,
    JSON.stringify(categoryMap, null, 2)
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

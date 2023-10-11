import { MixanIssue, MixanIssuesResponse } from "@mixan/types";

export function issues(arr: Array<MixanIssue>): MixanIssuesResponse {
  return {
    issues: arr.map((item) => {
      return {
        field: item.field,
        message: item.message,
        value: item.value,
      };
    })
  }
}
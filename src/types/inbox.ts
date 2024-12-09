export interface MessageDetails {
    title:    string;
    url:      string;
    id:       number;
    folderId: number;
    date:     Date;
    user:     string;
    content:  string;
    html:     string;
    read:     boolean;
    files:    any[];
}

export interface Message {
    id:    number;
    user:  string;
    title: string;
    date:  Date;
    read:  boolean;
}

export interface SubjectGradesData {
    name: string;
    semester: Grades[];
    tempAverage: number;
    average: number;
};

export interface Grades {
    grades: GradeData[];
    tempAverage: number;
    average: number;
};

export interface GradeData {
    id: number;
    info: string;
    value: string;
};

export interface Grade {
    subject: string;
    value: string;
    id: number;
    info: string;
    url: string; // https://synergia.librus.pl/przegladaj_oceny/szczegoly/${id}
};